# Generative UI — 把 AI 输出变成用户界面

## 核心问题

传统 AI 产品：AI 返回文本 → 前端渲染 markdown。

Generative UI：AI 返回结构化 parts → 前端按类型分发渲染 → 交互式组件。

这是 AI SDK 的**定义性创新**。

## UIMessage vs ModelMessage

AI SDK 严格区分两种消息类型：

```typescript
// UI 层的消息（客户端）
type UIMessage = {
  id: string
  role: 'user' | 'assistant'
  parts: (TextPart | ToolCallPart | ToolResultPart | DataPart)[]
  metadata?: Record<string, unknown>
}

// 模型层的消息（服务端）
type ModelMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
}
```

`convertToModelMessages()` 在发送给 LLM 前转换 UI 消息。`toUIMessageStreamResponse()` 将流式模型输出转回 UI 格式。

## Parts-Based 渲染

消息不再是字符串。它们是类型化 parts 的数组：

```typescript
// 一个 assistant 消息的 parts
[
  { type: 'text', text: 'Let me check the weather for you.' },
  { type: 'tool-call', toolCallId: 'abc', toolName: 'weather', input: { city: 'SF' } },
  { type: 'tool-result', toolCallId: 'abc', toolName: 'weather', output: { temp: 24 } },
  { type: 'text', text: 'San Francisco is 24°C and sunny.' },
  { type: 'data', data: { suggestions: ['Bring sunscreen', 'Good day for hiking'] } },
]
```

渲染时按 part 类型分发：

```typescript
{message.parts.map(part => {
  switch (part.type) {
    case 'text':
      return <Markdown>{part.text}</Markdown>
    case 'tool-call':
      return <ToolCallWidget call={part} />    // AI 在调用工具 — 显示加载状态
    case 'tool-result':
      return <ToolResultCard result={part} />   // 工具结果 — 显示数据卡片
    case 'data':
      return <CustomComponent data={part.data} />
  }
})}
```

## useChat：把一切连起来

```typescript
import { useChat } from '@ai-sdk/react';

function Chat() {
  const { messages, sendMessage, status, addToolResult } = useChat({
    maxSteps: 5,
    onToolCall: async ({ toolCall }) => {
      // 客户端工具执行
      if (toolCall.toolName === 'get_location') {
        const pos = await getCurrentPosition()
        addToolResult({ toolCallId: toolCall.id, output: pos })
      }
    },
  })

  return (
    <div>
      {messages.map(m => (
        <Message key={m.id} parts={m.parts} />
      ))}
      <Input onSubmit={sendMessage} disabled={status === 'streaming'} />
    </div>
  )
}
```

## 和 Claude Code 终端渲染的对比

| 维度 | Claude Code（终端） | AI SDK（浏览器） |
|------|-------------------|-----------------|
| 渲染目标 | Terminal（ANSI） | DOM（React） |
| 工具调用 UI | 文本 block | 交互式组件（加载态 + 结果卡片） |
| 权限提示 | 终端内对话框 | 自定义 React 组件 |
| 流式 | ANSI escape 序列重绘 | React 状态更新 + DOM diff |
| 组件复用 | Ink React 组件（专用） | 标准 React 组件 |

## 前端启示

**Generative UI 是 AI 产品的未来。** LLM 不需要只返回文本。它可以返回结构化数据、工具调用、UI 建议。前端的工作从"渲染 AI 的 markdown 输出"变成"为 AI 的每种输出类型构建交互式组件"。

**Parts-based 设计是正确的前端抽象。** 不要解析 AI 输出字符串。让 SDK 给你类型化的 parts 数组。每种 part 类型对应一种 UI 组件。添加新的 AI 能力变成添加新的 part 类型 + 对应的组件。

**客户端工具执行让 AI 能操作用户界面。** AI 不再只是建议 — 它可以点击按钮、打开面板、切换主题、触发导航。`onToolCall` 是 AI 的"手"。
