# 第 5 章：Agent Loop

## 心跳

第 4 章展示了 API 层如何将配置转换为流式 HTTP 请求。但单次 API 调用不是 agent。Agent 是一个循环：调用模型，执行工具，将结果反馈回去，再次调用模型，直到工作完成。

每个系统都有一个重心。在数据库中，是存储引擎。在编译器中，是中间表示。在 Claude Code 中，是 `query.ts` —— 一个 1,730 行的文件，包含运行每次交互的 async generator，从 REPL 的第一次按键到 headless `--print` 调用的最后一次工具调用。

这不是夸张。有且仅有一个代码路径与模型对话、执行工具、管理上下文、从错误中恢复并决定何时停止。那个代码路径就是 `query()` 函数。REPL 调用它。SDK 调用它。子 agent 调用它。Headless runner 调用它。如果你在使用 Claude Code，你就在 `query()` 里面。

这个文件很密集，但它的复杂不像纠缠的继承层次那样复杂。它像潜艇一样复杂：一个单一的船体，带有很多冗余系统，每一个都是因为海洋找到了一条进来的路而添加的。每个 `if` 分支都有一个故事。

## 为什么用 Async Generator

第一个架构问题：为什么 agent loop 是 generator 而不是基于回调的事件发射器？

三个原因，按重要性排列。

**背压（Backpressure）。** 事件发射器不管消费者是否准备好就触发。Generator 只在消费者调用 `.next()` 时才产出。当 REPL 的 React 渲染器在忙于绘制前一帧时，generator 自然地暂停。没有缓冲区溢出，没有消息丢失。

**返回值语义。** Generator 的返回类型是 `Terminal` —— 一个精确编码循环为何停止的可辨识联合类型。是正常完成？用户中止？token 预算耗尽？stop hook 干预？达到最大轮次？不可恢复的模型错误？共有 10 种不同的终端状态。调用者不需要订阅"结束"事件然后祈祷 payload 包含原因。

**通过 `yield*` 的可组合性。** 外部 `query()` 函数通过 `yield*` 委托给 `queryLoop()`，透明地转发每个产出的值和最终返回。`handleStopHooks()` 等子 generator 使用相同的模式。

## 调用者提供什么

```typescript
type LoopParams = {
  messages: Message[]
  prompt: SystemPrompt
  permissionCheck: CanUseToolFn
  context: ToolUseContext
  source: QuerySource         // 'repl', 'sdk', 'agent:xyz', 'compact' 等
  maxTurns?: number
  budget?: { total: number }  // API 级别的 task budget
  deps?: LoopDeps             // 为测试注入
}
```

显著字段：
- **`querySource`**：字符串鉴别器。许多条件分支依赖此字段。compact agent 使用 `querySource: 'compact'` 以避免阻塞守卫死锁。
- **`taskBudget`**：API 级别的任务预算，不同于 `+500k` 的 auto-continue token 预算功能。
- **`deps`**：可选的依赖注入。这是测试替换假模型调用、假压缩和确定性 UUID 的接缝。
- **`canUseTool`**：返回给定工具是否被允许的函数。这是权限层。

## 状态对象

循环维护可变跨迭代状态，包含约 15 个字段。`State` 类型在每次迭代顶部解构，Continue 站点写入 `state = { ... }`。

## 上下文压缩流水线

**在 LLM 调用之前**，消息经过多层压缩：

1. **applyToolResultBudget()** — 按工具 `maxResultSizeChars` 裁剪结果
2. **snipCompactIfNeeded()** — 裁剪旧的、不重要的消息（实验性功能）
3. **microcompact()** — 将旧 tool_result 替换为 `[Old tool result content cleared]`
4. **contextCollapse()** — 读时投影，通过 commit log 持久化（实验性功能）
5. **autocompact()** — 触发条件：token 超阈值。流程：pre-compact hooks → 调 fork agent 做摘要 → post-compact hooks

## 模型调用

```typescript
for await (const message of deps.callModel({
  messages: prependUserContext(messagesForQuery, userContext),
  systemPrompt: fullSystemPrompt,
  tools: toolUseContext.options.tools,
  signal: toolUseContext.abortController.signal,
  options: { model, fallbackModel, querySource, taskBudget, ... },
})) {
  // 处理流式响应
  // 检测 tool_use blocks → toolUseBlocks.push(block)
  // 检测 needsFollowUp = true
}
```

## 工具执行

如果 `needsFollowUp` 为 true：
- 分区工具调用（safe → 并行批，unsafe → 串行批）
- `StreamingToolExecutor` 可能已经在模型流式输出期间启动了安全工具
- 执行所有工具，收集结果
- 应用后采样 hooks
- 将结果作为消息追加
- `continue` 回到循环顶部

## 终端状态

循环返回一个 `Terminal`（可辨识联合类型），有 10 种变体：
- `normal`：正常完成
- `user_abort`：用户中止
- `max_turns`：达到最大轮次
- `blocking_limit`：token 阻止限制
- `token_budget`：budget 耗尽
- `stop_hook`：hook 触发停止
- `error`：不可恢复错误
- 等等。

## Apply This

**1. 使用 async generator 作为 agent loop。** Generator 提供自然的背压、类型化返回值和通过 `yield*` 的可组合性。回调架构分散了控制流，使调试变得困难。

**2. 让调用者注入依赖。** `deps` 模式是一个简单的接缝，允许测试替换模型调用、压缩和 UUID 生成。没有它，agent loop 是不可测试的。

**3. 上下文压缩在调用模型之前运行，而不是之后。** 向模型发送干净的消息集，向后压缩（记录旧结果用于调试）。不要只追加——也要删除。

**4. 类型化你的终端状态。** 可辨识联合类型确保每个停止原因都被显式处理。永远不要返回"大概完成了"的字符串。

**5. 一个函数统治一切。** 所有交互——REPL、SDK、子 agent、headless——都通过同一个 `query()` 函数。这条规则使行为可预测，性能优化普遍受益。
