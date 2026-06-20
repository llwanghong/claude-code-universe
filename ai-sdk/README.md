# Vercel AI SDK 深度分析

Vercel AI SDK 补全了我们知识体系的**第五层** — 把 Agent 能力转化为用户可用的产品。

## 在五层架构中的位置

```
Layer 5: Generative UI         ← Vercel AI SDK（本目录）
Layer 4: Agent 编排             ← 架构书 ch08-10
Layer 3: 上下文 & 记忆          ← 架构书 ch05/11
Layer 2: Tool System            ← 架构书 ch06
Layer 1: Agent Loop             ← 架构书 ch05
```

## 核心问题

Claude Code 教你**怎么造 Agent**。Vercel AI SDK 教你**怎么把 Agent 变成一个产品**。

Claude Code 的 query() 跑在终端里。用户看到的是 ANSI escape 序列。工具结果是 terminal 里的文本块。

Vercel AI SDK 的 generateText() / streamText() 跑在服务端。用户看到的是 React 组件。工具结果是交互式 UI 卡片。

这是同一枚硬币的两面。理解了第一面（我们已经深入分析过了），再理解第二面，你就掌握了从前端到后端的完整 AI 产品技术栈。

## 目录

| 文档 | 主题 |
|------|------|
| [01-core-vs-query](./01-core-vs-query.md) | generateText/streamText vs Claude Code query() |
| [02-tool-system](./02-tool-system.md) | tool() vs buildTool() |
| [03-generative-ui](./03-generative-ui.md) | useChat + parts-based 渲染 |
| [04-provider-abstraction](./04-provider-abstraction.md) | 多模型统一 API |
| [05-agentic-control](./05-agentic-control.md) | stopWhen / prepareStep / maxSteps |
| [06-complete-picture](./06-complete-picture.md) | 五层完整技术栈 + 能力全景 |
