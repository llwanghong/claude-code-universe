# 第 5 章：Agent Loop

## 跳动的心脏

第 4 章展示了 API 层如何将配置转换为流式 HTTP 请求——客户端如何构建、system prompt 如何组装、响应如何作为 server-sent events 到达。该层处理与模型*对话的机制*。但单次 API 调用不是 agent。Agent 是一个循环：调用模型，执行工具，将结果反馈回去，再次调用模型，直到工作完成。

每个系统都有一个重心。在数据库中，是存储引擎。在编译器中，是中间表示。在 Claude Code 中，是 `query.ts`——一个 1,730 行的文件，包含运行每次交互的 async generator，从 REPL 的第一次按键到 headless `--print` 调用的最后一次工具调用。

这不是夸张。存在且仅存在一个代码路径与模型对话、执行工具、管理上下文、从错误中恢复并决定何时停止。那个代码路径就是 `query()` 函数。REPL 调用它。SDK 调用它。子 agent 调用它。Headless runner 调用它。如果你在使用 Claude Code，你就在 `query()` 里面。

这个文件是密集的，但它的复杂不像纠缠的继承层次那样复杂。它像潜艇一样复杂：一个单一的船体，带有很多冗余系统，每一个都因为海洋找到了一条进来的路而添加。每个 `if` 分支都有一个故事。每个被 withheld 的错误消息代表一个真实的 bug，其中某个 SDK 消费者在恢复中途断开连接。每个 circuit breaker 阈值都是根据真实会话调整的，那些会话在无限循环中烧毁了数千次 API 调用。

本章从头到尾追踪整个循环。到最后，你不仅会理解发生了什么，还会理解为什么每个机制存在以及没有它什么会崩溃。

---

## 为什么是 Async Generator

第一个架构问题：为什么 agent loop 是 generator 而不是基于回调的事件发射器？

```typescript
// Simplified — shows the concept, not the exact types
async function* agentLoop(params: LoopParams): AsyncGenerator<Message | Event, TerminalReason>
```

实际签名产出几种消息和事件类型，并返回一个编码了循环为何停止的可辨识联合类型。

三个原因，按重要性排序。

**背压（Backpressure）。** 事件发射器不管消费者是否准备好就触发。Generator 只在消费者调用 `.next()` 时才产出。当 REPL 的 React 渲染器正在忙于绘制前一帧时，generator 自然暂停。当 SDK 消费者正在处理工具结果时，generator 等待。没有缓冲区溢出，没有丢失消息，没有"快速生产者/慢速消费者"问题。

**返回值语义。** Generator 的返回类型是 `Terminal`——一个可辨识联合类型，精确编码了循环为何停止。是正常完成？用户中止？token 预算耗尽？stop hook 干预？达到最大轮次？不可恢复的模型错误？有 10 种不同的终端状态。调用者不需要订阅"结束"事件然后祈祷 payload 包含原因。它们将其作为 `for await...of` 或 `yield*` 的类型化返回值获得。

**通过 `yield*` 的可组合性。** 外部 `query()` 函数通过 `yield*` 委托给 `queryLoop()`，它透明地转发每个产出的值和最终的返回。像 `handleStopHooks()` 这样的子 generator 使用相同的模式。这创建了一个干净的职责链，没有回调、没有 promises 包裹 promises、没有事件转发样板代码。

这个选择有一个代价——JavaScript 中的 async generator 不能被"倒回"或 fork。但 agent loop 两者都不需要。它是一个严格向前移动的状态机。

还有一个微妙之处：`function*` 语法使函数*惰性*。函数体在第一次 `.next()` 调用之前不执行。这意味着 `query()` 立即返回——所有重量级初始化（配置快照、memory 预取、budget tracker）只在消费者开始拉取值时才发生。在 REPL 中，这意味着 React 渲染管道在循环的第一行运行之前已经设置好了。

---

## 调用者提供什么

在追踪循环之前，了解输入是有帮助的：

```typescript
// Simplified — illustrates the key fields
type LoopParams = {
  messages: Message[]
  prompt: SystemPrompt
  permissionCheck: CanUseToolFn
  context: ToolUseContext
  source: QuerySource         // 'repl', 'sdk', 'agent:xyz', 'compact', 等
  maxTurns?: number
  budget?: { total: number }  // API 级 task budget
  deps?: LoopDeps             // 为测试注入
}
```

值得注意的字段：

- **`querySource`**：一个字符串鉴别器，如 `'repl_main_thread'`、`'sdk'`、`'agent:xyz'`、`'compact'` 或 `'session_memory'`。许多条件分支依赖此字段。Compact agent 使用 `querySource: 'compact'` 以使阻塞限制守卫不死锁（compact agent 需要运行来*减少* token 计数）。

- **`taskBudget`**：API 级的 task budget（`output_config.task_budget`）。与 `+500k` 的 auto-continue token 预算功能不同。`total` 是整个 agentic turn 的预算，`remaining` 是根据累积 API 使用量每迭代计算的，并跨 compaction 边界调整。

- **`deps`**：可选的依赖注入。默认为 `productionDeps()`。这是测试替换假模型调用、假压缩和确定性 UUID 的接缝。

- **`canUseTool`**：一个返回给定工具是否被允许的函数。这是权限层——它检查信任设置、hook 决策和当前权限模式。

---

## 两层入口点

公共 API 是围绕真实循环的一个薄包装：

```typescript
export async function* query(params: QueryParams): AsyncGenerator<...> {
  const consumedCommandUuids: string[] = []
  const terminal = yield* queryLoop(params, consumedCommandUuids)
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal
}
```

外部函数包装内部循环，跟踪在 turn 期间消费了哪些排队命令。内部循环完成后，消费的命令被标记为 `'completed'`。如果循环抛出或 generator 通过 `.return()` 关闭，完成通知永远不会触发——一个失败的 turn 不应该将命令标记为成功处理。在 turn 期间排队的命令在循环内被标记为 `'started'`，在包装器中标记为 `'completed'`。如果循环抛出或 generator 通过 `.return()` 关闭，完成通知永远不会触发。这是故意的——一个失败的 turn 不应该将命令标记为成功处理。

---

## 状态对象

```typescript
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined
}
```

可变状态携带在跨迭代的 `State` 对象中。状态在每次迭代顶部解构，Continue 站点写入 `state = { ... }` 而不是做 9 次单独的赋值。`toolUseContext` 是唯一在同一迭代中被重新赋值的字段（queryTracking、messages 更新），其余的 Continue 站点之间是只读的。

---

## 上下文压缩流水线

**在 LLM 调用之前**，消息经过多层压缩。每层比上一层更轻量。

### 第 1 层：applyToolResultBudget

按工具 `maxResultSizeChars` 裁剪工具结果。在微观压缩之前运行——预算层无条件运行，按内容大小操作，而 microcompact 按工具类型选择性操作。两者正交组合。

### 第 2 层：snipCompactIfNeeded（实验性）

裁剪旧的、不重要的消息。一个基于 token 计数的算法确定在哪里切断历史。被裁剪的消息被一个边界消息替换，记录它们被移除了。

### 第 3 层：microcompact

将旧的 tool_result 替换为占位符。只有某些工具的结果被压缩：

```typescript
const COMPACTABLE_TOOLS = new Set([
  FILE_READ_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  GREP_TOOL_NAME, GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME, WEB_FETCH_TOOL_NAME,
  FILE_EDIT_TOOL_NAME, FILE_WRITE_TOOL_NAME,
])
```

一些工具（如 Read）是参考材料——它们的输出被保留。其他（如旧的 shell 命令输出）是可以丢弃的。逻辑按 tool_use_id 操作，使它与按内容大小操作的工具结果预算正交。

### 第 4 层：contextCollapse（实验性）

上下文折叠使用读时投影——原始消息保留在 REPL 历史中，但查询循环看到一个折叠的视图，其中不重要的消息被替换为摘要。折叠通过 commit log 持久化，使它们在轮次之间存活。

### 第 5 层：autocompact

当 token 计数超过阈值时触发。流程：执行 pre-compact hooks → 调用 compact agent 进行摘要 → 执行 post-compact hooks。Compact agent 是一个 fork 的 agent，继承父 agent 的完整对话，但产生一个压缩后的摘要。

```typescript
const { compactionResult } = await deps.autocompact(messagesForQuery, toolUseContext, {
  systemPrompt, userContext, systemContext, toolUseContext,
  forkContextMessages: messagesForQuery,
}, querySource, tracking, snipTokensFreed)
```

如果压缩成功，原始消息被替换为 `postCompactMessages`（摘要 + attachments + hook results）。Circuit breaker 防止无限的重试循环：如果自动压缩连续失败，系统停止尝试并返回一个错误。

---

## 模型调用

```typescript
for await (const message of deps.callModel({
  messages: prependUserContext(messagesForQuery, userContext),
  systemPrompt: fullSystemPrompt,
  thinkingConfig: toolUseContext.options.thinkingConfig,
  tools: toolUseContext.options.tools,
  signal: toolUseContext.abortController.signal,
  options: {
    model: currentModel,
    fallbackModel,
    querySource,
    // ... dozens more configuration options
  },
})) {
  // Process streaming response
}
```

模型调用是流式的。`callModel()` 产出一个 `StreamEvent` 的 async generator。循环检查 `tool_use` blocks 并设置 `needsFollowUp = true`。Assistant 消息被累积到 `assistantMessages` 数组中。

流式过程中可能出现 Fallback：如果主模型失败，如果配置了 fallback 模型，系统透明地切换。来自失败尝试的部分消息被 tombstone 处理（从 UI 和 transcript 中移除），一个新的流与 fallback 模型开始。

---

## 工具执行

如果 `needsFollowUp` 为 true——即模型发出了工具调用——循环执行它们：

```typescript
if (needsFollowUp) {
  const results = await runTools(toolUseBlocks, toolUseContext, canUseTool)
  for (const result of results) {
    yield result  // Tool result messages
  }
  messagesForQuery.push(...results)
  state = { ...state, messages: messagesForQuery, turnCount: turnCount + 1 }
  continue  // Back to top of while(true)
}
```

`runTools()` 函数（第 7 章详述）将工具调用分区为并发和串行批次，安全执行它们，并返回结果。在模型流式输出期间，`StreamingToolExecutor` 可能已经在模型完成响应之前启动了并发安全的工具。

工具执行后，运行 post-sampling hooks。Hooks 可以修改工具结果、注入额外消息或完全短路循环。Stop hooks 可以设置 `stopHookActive = true`，导致循环退出。

---

## 终端状态

循环返回一个 `Terminal`——一个精确编码循环为何停止的可辨识联合类型：

```typescript
type Terminal =
  | { reason: 'completed' }
  | { reason: 'user_abort' }
  | { reason: 'max_turns' }
  | { reason: 'blocking_limit' }
  | { reason: 'token_budget' }
  | { reason: 'stop_hook' }
  | { reason: 'error'; error: Error }
  // ... additional states
```

每个调用者——REPL、SDK、子 agent——接收 Terminal 并决定下一步做什么。REPL 显示结果。SDK 客户端可能重试。父 agent 将子 agent 的 Terminal 解释为 tool_result。

---

## Error Recovery Loop

一个内部的 recovery loop 处理 `max_output_tokens` 错误。当模型在完成响应之前命中 output token 限制时，结果是不完整的——可能缺少关键的 closing tags、函数调用或代码块。系统通过升级 output token slot 并重试相同请求来处理此问题。

Recovery 被 gate 为最多 3 次尝试。如果第三次尝试后请求仍然命中限制，系统接受部分结果并继续。这防止了无限循环——在某个点，部分结果比没有结果好。

---

## Token 预算系统

使用 `+500k` 指令，用户可以设置每 turn 的 token 预算。系统每迭代跟踪累积的 output token，在预算耗尽时自动停止。

```typescript
if (budgetTracker && checkTokenBudget(budgetTracker)) {
  return { reason: 'token_budget' }
}
```

预算系统与 task budget 不同。前者限制整个 agentic turn 的 output token，而 task budget 是传递给 API 的一个单独参数，控制 API 级别的总 token 使用。两者可以同时活跃。

---

## Apply This

**使用 async generator 作为你的 agent loop。** Generator 提供自然的背压、类型化的返回值和通过 `yield*` 的可组合性。回调架构分散了控制流并使调试变得困难。类型系统强制穷举处理——10 种终端状态，没有一个是"约莫着完成了"。

**在调用模型*之前*压缩上下文。** 在附加新内容后压缩的替代方案——在事实之后压缩——与一个不断增长的上下文窗口作斗争。在调用模型之前运行压缩。给模型一个干净的消息集。向后压缩（记录旧结果以便调试），但向前发送简洁的上下文。

**让调用者注入依赖。** `deps` 模式是一个简单的接缝，允许测试替换模型调用、压缩和 UUID 生成。没有它，agent loop 是不可测试的——没有办法在不进行真实 API 调用的情况下验证一个 1,700 行的 generator 函数的行为。

**类型化你的终端状态。** discriminated union（可辨识联合类型）确保每个停止原因都被显式处理。永远不要返回"大概是完成了"的字符串。调用者——REPL、SDK、子 agent——依赖精确的终端状态类型来做出关于下一步做什么的正确决策。

**错误恢复是分层的事情。** API 层在到达 agent loop 之前处理网络错误和 provider 回退。Agent loop 处理 max_output_tokens 恢复。Stop hooks 处理用户发起的停止。每层解决自己能解决的问题，并向上传播其余问题。
