# Agentic Loop 控制 — stopWhen / prepareStep / maxSteps

## 从 while(true) 到声明式控制

Claude Code 的 Agent Loop：

```typescript
// 你拥有循环。你决定何时停止。你管理所有状态。
while (true) {
  const events = await callModel({ messages, tools })
  if (noMoreToolCalls) return { reason: 'completed' }
  const results = await executeTools(events)
  messages.push(...results)
}
```

AI SDK 的 Agent Loop：

```typescript
// 库拥有循环。你提供停止条件和步骤控制。
const result = await generateText({
  model: openai('gpt-4o'),
  tools: { search, fetch, analyze },
  maxSteps: 10,
  stopWhen: stepCountIs(10),
  prepareStep: async ({ stepNumber, messages, steps }) => {
    // 每一步前调用 — 可以改模型、换工具、加减上下文
  },
})
```

## stopWhen — 声明式停止条件

```typescript
import { generateText, stepCountIs } from 'ai'

const result = await generateText({
  // 在 3 轮工具调用后强制停止
  stopWhen: stepCountIs(3),
})

// 自定义停止条件
const result2 = await generateText({
  stopWhen: [
    stepCountIs(10),                    // 最多 10 轮
    ({ steps }) => {
      const lastOutput = steps[steps.length - 1]?.text
      return lastOutput?.includes('DONE')  // 模型输出包含 DONE
    },
  ],
})
```

## prepareStep — 动态步骤控制

每一步调用模型前，`prepareStep` 让你检查和修改配置：

```typescript
const result = await generateText({
  prepareStep: async ({
    stepNumber,
    model,
    messages,
    steps,
    toolsContext,
  }) => {
    // 1. 模型切换
    if (stepNumber > 5) {
      return { model: openai('gpt-4o-mini') }
    }

    // 2. 动态工具选择
    if (stepNumber === 1) {
      return { activeTools: ['search'] }  // 第一步只给 search
    }

    // 3. 注入上下文
    return {
      instructions: `Step ${stepNumber}. Be thorough.`,
      messages: [...messages, { role: 'system', content: 'Progress update...' }],
    }
  },
})
```

## Claude Code 中对应的控制

| AI SDK | Claude Code 等价 |
|--------|-----------------|
| `maxSteps` | `maxTurns`（query.ts 中的硬上限） |
| `stopWhen: stepCountIs(n)` | `turnCount >= maxTurns` 检查 |
| `stopWhen: custom` | Agent loop 中的自定义 return 条件 |
| `prepareStep: model` | `getRuntimeMainLoopModel()` + permissionMode 检查 |
| `prepareStep: activeTools` | `agentDefinition.tools` 白名单/黑名单 |
| `prepareStep: instructions` | `systemPrompt` 动态追加 |

## 关键差异

AI SDK 的 `prepareStep` 是每步一个回调。Claude Code 的对应逻辑分散在 agent loop 的多个位置：

- 模型选择：在 `query.ts` 的 `getRuntimeMainLoopModel()` 中
- 工具选择：在 `runAgent.ts` 的 tool filtering 中
- 上下文注入：在 `prependUserContext()` / `appendSystemContext()` 中

**AI SDK 集中化控制，Claude Code 分布式控制。** 各有优势：
- AI SDK：一个 `prepareStep` 看全部，易于理解和调试
- Claude Code：每个关注点有自己的处理位置，可独立测试和优化

## 前端启示

**`prepareStep` 是理解 agent loop 控制面的最佳入口。** 如果你想在 AI 产品中加入 Agent 能力，从 `prepareStep` 开始 — 在这里切换模型、限制工具、注入上下文。不需要写自己的 while 循环。

**`stopWhen` 避免无限循环。** 生产环境中，模型有时会陷入重复循环。`stopWhen: stepCountIs(N)` 是最低成本的保险。Claude Code 有同样的机制（maxTurns、token budget、circuit breaker）。

**声明式控制适合产品，命令式控制适合基础设施。** 如果你在构建用户产品，AI SDK 的声明式 API 更快、更安全。如果你在构建 Agent 平台，Claude Code 的命令式控制给你最大灵活性。
