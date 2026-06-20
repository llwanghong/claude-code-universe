# 第 7 章：并发工具执行

## 等待的代价

典型的 Claude Code 交互涉及每次 3 到 5 个工具调用。"读这两个文件，grep 这个模式，然后编辑这个函数。"如果每个工具需要 200 毫秒，串行执行花费一整秒。如果读和 grep 是独立的——它们确实是——并行运行削减到 200 毫秒。

但并非所有工具都是独立的。修改 `config.ts` 的 Edit 不能与另一个修改 `config.ts` 的 Edit 同时运行。创建一个目录的 Bash 命令必须在向其中写入文件的 Bash 命令之前完成。**安全性是每个调用的（per-call），不是每个工具类型的（per-tool-type）。** 相同工具，不同输入，不同并发分类。

> 💡 **译注**：大多数框架的并发模型是声明式的——你写 `tool({ parallelSafe: true })` 就完了。但 Claude Code 把"是否安全"推迟到运行时，根据具体输入判断。`Bash("ls")` 只读，可并行。`Bash("rm -rf /")` 破坏性写，不可并行。同一个 Bash 工具，不同输入，不同并发分类。

---

## 分区算法：真实源码

这是 `services/tools/toolOrchestration.ts` 中的实际代码：

```typescript
/**
 * Partition tool calls into batches where each batch is either:
 * 1. A single non-read-only tool, or
 * 2. Multiple consecutive read-only tools
 */
function partitionToolCalls(
  toolUseMessages: ToolUseBlock[],
  toolUseContext: ToolUseContext,
): Batch[] {
  return toolUseMessages.reduce((acc: Batch[], toolUse) => {
    const tool = findToolByName(toolUseContext.options.tools, toolUse.name)
    const parsedInput = tool?.inputSchema.safeParse(toolUse.input)
    const isConcurrencySafe = parsedInput?.success
      ? (() => {
          try {
            return Boolean(tool?.isConcurrencySafe(parsedInput.data))
          } catch {
            // If isConcurrencySafe throws (e.g., due to shell-quote parse failure),
            // treat as not concurrency-safe to be conservative
            return false
          }
        })()
      : false
    if (isConcurrencySafe && acc[acc.length - 1]?.isConcurrencySafe) {
      acc[acc.length - 1]!.blocks.push(toolUse)
    } else {
      acc.push({ isConcurrencySafe, blocks: [toolUse] })
    }
    return acc
  }, [])
}
```

算法从左到右遍历模型发出的工具调用。关键逻辑：
1. 按名称查找工具定义
2. 用 Zod schema 解析输入——解析失败 → fail-closed（保守分类为不安全）
3. 调用 `tool.isConcurrencySafe(parsedInput)`——Bash 工具解析命令字符串判断只读/写入
4. 如果并发安全 **且** 上一个批次也安全 → 追加到同一批次。否则 → 新批次

```
模型请求：[Read, Read, Grep, Edit, Read]

Step 1: Read  → safe → 新批次 {parallel, [Read]}
Step 2: Read  → safe → 追加   {parallel, [Read, Read]}
Step 3: Grep  → safe → 追加   {parallel, [Read, Read, Grep]}
Step 4: Edit  → NOT  → 新批次 {serial, [Edit]}
Step 5: Read  → safe → 新批次 {parallel, [Read]}

结果: 3 个批次 → Batch 1 并发, Batch 2 单独, Batch 3 并发
```

---

## 批次执行

`runTools()` generator 遍历分区后的批次，将并发安全的批次分派给 `runToolsConcurrently()`，串行批次分派给 `runToolsSerially()`：

```typescript
export async function* runTools(toolUseMessages, assistantMessages, canUseTool, toolUseContext) {
  let currentContext = toolUseContext
  for (const { isConcurrencySafe, blocks } of partitionToolCalls(toolUseMessages, currentContext)) {
    if (isConcurrencySafe) {
      // 并发执行所有只读工具
      for await (const update of runToolsConcurrently(blocks, ...)) {
        // 上下文修改器排队，批次完成后统一应用
      }
    } else {
      // 串行执行，每个工具完成后立即应用上下文修改器
      for await (const update of runToolsSerially(blocks, ...)) {
        currentContext = update.newContext
      }
    }
  }
}
```

注意并发批次的上下文修改器排队：当工具并发运行时，不能立即应用上下文修改器（其他工具还在读取同一上下文）。修改器按 `toolUseId` 收集在 map 中，在批次完成后按模型发出工具调用的顺序应用。

并发限制默认为 10，通过 `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` 环境变量配置。

---

## StreamingToolExecutor：推测执行

并发系统的第二层在模型流式输出期间就启动工具：

```typescript
// StreamingToolExecutor 监控流中的 tool_use 块
// 当检测到并发安全工具时，在模型完成之前启动
// 当流完成时，该工具可能已经返回了结果
```

推测执行在假设模型流式输出期间到达的工具调用是模型意图的真实反映的情况下运行。如果模型后来的输出使工具调用无效（极端罕见），结果被丢弃。

---

## Apply This

**安全性是每个调用的，不是每个工具类型的。** `Bash("ls")` 安全；`Bash("rm -rf /")` 不安全。检查输入，而不是工具名称。实现 `isParallelSafe(input)` 来做每个调用的决策。

**贪心、保持顺序的分区。** 连续安全工具合并为一个批次。不安全工具打破运行。简单、可预测、快速——18 行代码。

**在等待模型时启动安全工具。** 流式输出时间是空闲 CPU 时间。如果最终输出使推测无效（罕见），丢弃结果。

**Fail-closed：解析错误 → 串行。** `isConcurrencySafe` 中的 try-catch 防止错误输入破坏系统。宁可慢也不要不正确。

**上下文修改器排队用于并发批次。** 收集、按工具调用顺序排列、批次完成后应用。这确保模型指定的顺序依赖关系被保留。
