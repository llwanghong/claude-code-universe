# AI SDK tool() vs Claude Code buildTool() — 工具系统的两种范式

## 相同之处

两个系统的核心契约完全一致：工具的输入/输出都通过 Zod schema 定义，都支持异步 execute 函数，都有描述字段告诉模型何时使用。

```typescript
// Vercel AI SDK
const weatherTool = tool({
  description: 'Get the weather',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ temp: 24 }),
})

// Claude Code（伪代码对照）
const WeatherTool = buildTool({
  name: 'weather',
  async description() { return 'Get the weather' },
  inputSchema: z.object({ city: z.string() }),
  async call(input) { return { temp: 24 } },
})
```

## 关键差异

### 1. 客户端工具 vs 服务端工具

AI SDK 的核心创新：工具可以在**客户端**执行。

```typescript
// 服务端 — 只声明工具签名，不提供 execute
const weatherTool = tool({
  description: 'Get the weather',
  inputSchema: z.object({ city: z.string() }),
  // 没有 execute — 工具在客户端执行！
})

// 客户端 — useChat 的 onToolCall 处理执行
const { messages } = useChat({
  onToolCall: async ({ toolCall }) => {
    if (toolCall.toolName === 'weather') {
      // 在浏览器中执行 — 可以访问 DOM、localStorage、用户位置
      const weather = await fetch(`/api/weather?city=${toolCall.input.city}`)
      return weather.json()
    }
  },
})
```

Claude Code 的所有工具都在服务端（同一进程内）执行。没有客户端/服务端分离。

### 2. Generative UI 的桥梁

当一个工具在客户端执行时，其结果可以渲染为 React 组件：

```typescript
// message.parts 中的 tool-call 和 tool-result 是原生 React 可渲染的
{message.parts.map(part => {
  switch (part.type) {
    case 'tool-call':
      return <WeatherCard city={part.input.city} loading />
    case 'tool-result':
      return <WeatherCard city={part.input.city} data={part.output} />
    case 'text':
      return <Markdown content={part.text} />
  }
})}
```

Claude Code 的工具结果是 ANSI 转义序列文本。AI SDK 的工具结果是类型化的、可渲染的组件 props。

### 3. outputSchema — AI SDK 独有的能力

```typescript
const weatherTool = tool({
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({    // ← Claude Code 没有这个
    temperature: z.number(),
    condition: z.enum(['sunny', 'rainy', 'cloudy']),
    humidity: z.number(),
  }),
  execute: async ({ city }) => ({ ... }),
})
```

`outputSchema` 让前端获得完整的类型推导。`part.output` 的类型自动为 `{ temperature: number, condition: string, humidity: number }`。

Claude Code 的工具返回类型是 TypeScript 类型，但不通过 Zod 验证，也不在 API 层面对模型暴露预期输出格式。

### 4. 并发安全

Claude Code 的 `isConcurrencySafe(input)` 精细控制每个调用的并发。

AI SDK 没有这个层次的并发控制 — 它依赖开发者在 `execute` 函数中自行管理并发，或在客户端侧处理竞态条件。

原因不同：Claude Code 操作文件系统，并发写操作冲突。AI SDK 的典型工具调用 API 或数据库，并发安全由那些层处理。

## 前端启示

**客户端工具执行是 AI SDK 的杀手级特性。** 把 LLM 的工具调用变成浏览器侧的用户交互 — 点击确认按钮、获取地理位置、操作 DOM — 而不需要服务端作为中介。

**outputSchema 应该成为工具的标配。** 它为前端提供端到端的类型安全。从 Zod input schema → execute → Zod output schema → TypeScript 类型推导 → React props。Claude Code 没有这个，因为它不需要渲染 UI。

**选择范式**：
- 构建 AI 产品 UI → AI SDK（客户端工具 + Generative UI）
- 构建 Agent 基础设施 → Claude Code 模式（服务端工具 + 文件系统操作 + 并发安全）
