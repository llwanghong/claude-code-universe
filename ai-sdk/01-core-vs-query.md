# AI SDK Core vs Claude Code query() — Agent Loop 的两种设计哲学

## 本质区别

```
Claude Code:                   Vercel AI SDK:
开发者拥有循环                  库拥有循环
while (tool_use) { ... }      generateText({ maxSteps: 5 })
```

Claude Code 的 `query()` 是一个 async generator — 你调用它，你拉取消息，你决定何时停止。

Vercel AI SDK 的 `generateText()` 是一个 async 函数 — 你传递配置，库管理循环，你拿到最终结果。

这是两种不同哲学：

- **Claude Code**：模型是驾驶者，Harness 是载具。你造载具，模型开。
- **Vercel AI SDK**：库是驾驶者，你是乘客。你告诉库要去哪，库带你到那里。

## generateText：库管理的循环

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const result = await generateText({
  model: openai('gpt-4o'),
  tools: {
    weather: tool({
      description: 'Get the weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ temp: 24 }),
    }),
  },
  maxSteps: 5,      // ← 库管理循环，最多 5 轮
  stopWhen: stepCountIs(10),  // ← 声明式停止条件
  prompt: 'What is the weather in San Francisco?',
});
```

库内部实现了一个 `do { ... } while (...)` 循环：

```typescript
// AI SDK 内部 — packages/ai/src/generate-text/generate-text.ts
do {
  // 1. 调用模型
  const stepResult = await callModel({ messages, tools, ... })

  // 2. 收集工具调用
  const clientToolCalls = stepResult.toolCalls.filter(isClientTool)

  // 3. 执行工具
  for (const tc of clientToolCalls) {
    const output = await executeToolCall(tc, tools)
    clientToolOutputs.push(output)
  }

  // 4. 追加到消息历史
  messages = [...messages, assistantMessage, ...toolResults]
} while (
  clientToolCalls.length > 0 &&           // 有工具调用需要处理
  !isStopConditionMet(stopConditions)     // 还没到停止条件
)
```

## Claude Code query()：开发者拥有的循环

```typescript
// Claude Code — query.ts
export async function* query(params) {
  while (true) {
    // Before: 压缩上下文
    messagesForQuery = applyToolResultBudget(messagesForQuery)
    messagesForQuery = microcompact(messagesForQuery)
    messagesForQuery = autocompact(messagesForQuery)

    // Call: 流式调用模型
    for await (const event of callModel({ messages, tools, ... })) {
      if (event.type === 'tool_use') toolUseBlocks.push(event)
    }

    // After: 执行工具
    if (toolUseBlocks.length > 0) {
      const results = await runTools(toolUseBlocks)
      messages.push(...results)
      continue  // ← 你控制继续
    }

    return { reason: 'completed' }  // ← 你控制退出
  }
}
```

## 关键差异

| 维度 | Claude Code query() | Vercel AI SDK generateText() |
|------|-------------------|---------------------------|
| **循环所有权** | 开发者拥有 | 库拥有 |
| **控制粒度** | 每步前后都可拦截 | 通过 prepareStep / stopWhen |
| **上下文管理** | 5 层压缩流水线（自建） | 依赖 API context window |
| **流式** | AsyncGenerator，自然背压 | streamText() 返回 ReadableStream |
| **错误恢复** | fallback 模型、max_tokens 恢复 | 重试配置 |
| **终端状态** | 10 种 discriminated union | 标准 result 对象 |
| **适用场景** | 复杂 Agent 系统 | AI 功能嵌入现有产品 |

## 前端启示

**AI SDK 适合产品开发，Claude Code 模式适合 Agent 基础设施。**

如果你在做：
- Chatbot 产品 → AI SDK。`useChat({ maxSteps: 5 })` 就够了。
- 企业数据分析 Agent → AI SDK + 自定义 tool。
- 编程 Agent 平台 → Claude Code 模式。你需要完整的上下文压缩流水线和错误恢复。
- AI 研发工具链 → Claude Code 模式。你需要感知文件系统、管理持久化状态。

**关键判断标准**：如果你的 agent 需要管理自己的上下文窗口（压缩旧消息、选择性保留关键信息），你需要 Claude Code 模式。如果你只在一次 HTTP 请求内完成工作，AI SDK 就够了。
