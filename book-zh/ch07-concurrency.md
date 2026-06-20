# 第 7 章：并发工具执行

## 等待的代价

第 6 章追踪了单个工具调用的生命周期——从 API 响应中的原始 `tool_use` 块到输入验证、权限检查、执行和结果格式化。该流水线处理一个工具。但模型很少只请求一个。

一次典型的 Claude Code 交互涉及每次 3 到 5 个工具调用。"读这两个文件，grep 这个模式，然后编辑这个函数。"模型在单个响应中发出所有这些。如果每个工具需要 200 毫秒，串行执行花费整整一秒。如果 Read 和 Grep 调用是独立的——它们确实是——并行运行将其削减到 200 毫秒。五对一的改善，免费。

但并非所有工具都是独立的。修改 `config.ts` 的 Edit 不能与另一个修改 `config.ts` 的 Edit 同时运行。创建一个目录的 Bash 命令必须在向其中写入文件的 Bash 命令之前完成。并发不是工具的全局属性——它是具有特定输入的特定工具调用的属性。

这是驱动整个并发系统的洞察：**安全性是每个调用的（per-call），不是每个工具类型的（per-tool-type）**。`Bash("ls -la")` 可以安全并行。`Bash("rm -rf build/")` 不行。相同的工具，不同的输入，不同的并发分类。系统必须在决定之前检查输入。

> 💡 **译注**：大多数框架的并发模型是"声明式"的——你写 `tool({ parallelSafe: true })` 然后就完了。但 Claude Code 的方式完全不同：它把"是否安全"的决定推迟到了运行时，根据具体的输入来判断。因为即使是同一个工具，`ls`（只读）和 `rm`（破坏性写）的并发安全性截然不同。这是一个更精确但也更复杂的模型——它不是问"这个工具安全吗？"，而是问"这个工具用这个参数调用安全吗？"

Claude Code 实现两层并发优化。第一层是**批次编排**：在模型响应完全接收后，将工具调用分区为并发和串行组，然后适当地执行每个组。第二层是**推测执行**：在模型仍在流式传输响应时就开始运行工具，在响应甚至完成之前就收割结果。这两层机制一起消除了大部分本来会花在等待上的挂钟时间。

---

## 分区算法

入口点是 `toolOrchestration.ts` 中的 `partitionToolCalls()`。它接受一个有序的 `ToolUseBlock` 消息数组并产生一个批次数组，其中每个批次要么是"全部并发安全"要么是"单个串行工具"。

```typescript
// Pseudocode — illustrates the partition algorithm
type Group = { parallel: boolean; calls: ToolCall[] }

function groupBySafety(calls: ToolCall[], registry: ToolRegistry): Group[] {
  return calls.reduce((groups, call) => {
    const def = registry.lookup(call.name)
    const input = def?.schema.safeParse(call.input)
    // Fail-closed: parse failure or exception → serial
    const safe = input?.success
      ? tryCatch(() => def.isParallelSafe(input.data), false)
      : false
    // Merge consecutive safe calls into one group
    if (safe && groups.at(-1)?.parallel) {
      groups.at(-1)!.calls.push(call)
    } else {
      groups.push({ parallel: safe, calls: [call] })
    }
    return groups
  }, [] as Group[])
}
```

算法从左到右遍历数组。对于每个工具调用：

1. **按名称查找工具定义**。
2. **解析输入**，使用工具的 Zod schema 通过 `safeParse()`。如果解析失败，该工具被保守地分类为不安全。
3. **调用 `isConcurrencySafe(parsedInput)`**。Bash 工具解析命令字符串，检查每个子命令是否只读（`ls`、`grep`、`cat`、`git status`），仅在整个复合命令是纯读取时才返回 `true`。Read 工具始终返回 `true`。Edit 工具始终返回 `false`。调用被包裹在 try-catch 中——如果 `isConcurrencySafe` 抛出异常，工具默认为串行。
4. **合并或创建批次。** 如果当前工具并发安全并且最近的批次也并发安全，追加到该批次。否则，开始一个新批次。

结果是交替出现并发组和单个串行条目的批次序列。遍历一个具体例子：

```
模型请求：[Read, Read, Grep, Edit, Read]

Step 1: Read  → safe → 新批次 {safe, [Read]}
Step 2: Read  → safe → 追加   {safe, [Read, Read]}
Step 3: Grep  → safe → 追加   {safe, [Read, Read, Grep]}
Step 4: Edit  → NOT  → 新批次 {serial, [Edit]}
Step 5: Read  → safe → 新批次 {safe, [Read]}

结果: 3 个批次
  Batch 1: [Read, Read, Grep]  — 并发运行
  Batch 2: [Edit]              — 单独运行
  Batch 3: [Read]              — 并发运行（只有一个工具）
```

分区是贪心且保持顺序的。连续安全工具累积到一个批次中。任何不安全的工具打破运行并开始一个新批次。这意味着模型发出工具调用的顺序很重要——如果它在两个 Read 之间插入一个 Write，你会得到三个批次而不是两个。实际上，模型倾向于将其读取聚集在一起，这是算法为之优化的常见情况。

---

## 批次执行

`runTools()` generator 遍历已分区的批次，并将每个批次分发给适当的执行器。

### 并发批次

对于并发批次，`runToolsConcurrently()` 使用一个在并发限制处限制活跃 generator 的 `all()` 工具并行触发所有工具：

```typescript
// Pseudocode — illustrates the concurrent dispatch pattern
async function* dispatchParallel(calls, context) {
  yield* boundedAll(
    calls.map(async function* (call) {
      context.markInProgress(call.id)
      yield* executeSingle(call, context)
      context.markComplete(call.id)
    }),
    MAX_CONCURRENCY,  // Default: 10
  )
}
```

并发限制默认为 10，可通过 `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` 配置。十是慷慨的——你很少在单个模型响应中看到超过五六次工具调用。限制作为病态情况的安全阀存在，而不是典型约束。

`all()` 工具是 `Promise.all` 的 generator-aware 变体，具有有界并发。它同时启动最多 N 个 generator，从最先完成的任何 generator 产出结果，并在每个 generator 完成时启动下一个排队的 generator。机制类似于信号量保护的任务池，但适应于产出中间结果的 async generator。

**上下文修改器排队**是微妙的部分。一些工具产生*上下文修改器*——为后续工具转换 `ToolUseContext` 的函数。当工具并发运行时，你不能立即应用这些修改器，因为同一批次中的其他工具正在读取相同的上下文。相反，修改器按工具使用 ID 收集在 map 中：

```typescript
// Pseudocode
const contextModifiers = new Map<string, (ctx: ToolUseContext) => ToolUseContext>()
for (const result of concurrentResults) {
  if (result.contextModifier) {
    contextModifiers.set(result.toolUseId, result.contextModifier)
  }
}
// Apply all modifiers in tool-call order after the batch completes
const ordered = toolCallsByOrder.map(call => contextModifiers.get(call.id))
for (const modifier of ordered) {
  if (modifier) toolUseContext = modifier(toolUseContext)
}
```

这确保了在批处理中运行的工具看到一致的上下文，而修改器按模型发出工具调用的原始顺序应用。

### 串行批次

对于串行批处理（单个不安全的工具调用），`runToolsSerially()` 逐个执行它们。每个串行工具完成后，其上下文修改器立即在下一个串行工具开始之前应用。这保持了模型指定的顺序依赖关系。

---

## 推测执行

并发系统的第二层是**推测执行**：在模型*仍在流式传输响应*时启动工具执行。

`StreamingToolExecutor` 监控流中的 `tool_use` 块。当检测到一个并发安全工具时，它在模型完成之前就启动。当流完成时，该工具可能已经返回了结果。

```typescript
class StreamingToolExecutor {
  onToolUse(block: ToolUseBlock): void {
    if (this.registry.isSafe(block)) {
      // Start running this tool NOW, while the model is still streaming
      const promise = this.executeSafe(block)
      this.pendingResults.set(block.id, promise)
    }
  }

  async collectCompleted(): Promise<ToolResult[]> {
    // By the time the model's response is complete,
    // some tools may have already finished
    return Promise.all(this.pendingResults.values())
  }
}
```

推测执行在假设模型流式输出期间到达的工具调用是模型意图的真实反映的情况下运行。极少情况下（重新流式、fallback 或其他边缘情况），模型可能会发出后来在响应完成之前被无效化的工具调用。在这些情况下，推测结果被丢弃而不附加到对话。

---

## Apply This

**安全性是每个调用的，不是每个工具类型的。** `Bash("ls")` 安全；`Bash("rm -rf /")` 不安全。检查输入，而不是工具名称。实现 `isParallelSafe(input)` 来做出每个调用的决策。

**贪心、保持顺序的分区。** 安全运行的连续区间合并为一个批次。不安全的工具打破运行。简单、可预测、快速。模型通常是批量发出的读取，然后是写入——算法为最常见的模式做了优化。

**在等待模型时启动安全工具。** 流式输出时间是空闲 CPU 时间。利用它来执行只读工具。如果模型的最终输出使工具调用无效（罕见），丢弃结果。

**Fail-closed：解析错误 → 串行。** 如果你不能分析输入，就假设它不安全。宁可慢也不要不正确。try-catch 包围 `isParallelSafe()`——如果它抛出，工具以串行方式运行。

**上下文修改器排队。** 并发批处理中的工具不能立即应用上下文变化。收集它们，按工具调用顺序排列，在批次完成后应用。
