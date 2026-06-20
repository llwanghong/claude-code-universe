# 完整五层技术栈 — 从前端到 Agent 的全链路能力

## 五层架构全景

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: Generative UI                                       │
│ Vercel AI SDK                                                │
│ useChat · parts-based 渲染 · 客户端工具 · outputSchema 类型安全│
│ "把 Agent 能力变成用户愿意付费的产品"                            │
├──────────────────────────────────────────────────────────────┤
│ Layer 4: Agent 编排                                          │
│ Claude Code ch08-10 + learn-claude-code s09-12               │
│ Subagent · Fork Agent · Swarm · Workflow · Cron · Worktree   │
│ "一个 Agent 不够时，一群 Agent 怎么协作"                        │
├──────────────────────────────────────────────────────────────┤
│ Layer 3: 上下文 & 记忆                                        │
│ Claude Code ch05(ch11) + learn-claude-code s05-08            │
│ 5层压缩 · 文件记忆 · LLM召回 · 持久化任务 · Background Tasks    │
│ "让 Agent 记住该记住的，忘记该忘记的"                            │
├──────────────────────────────────────────────────────────────┤
│ Layer 2: Tool System                                          │
│ Claude Code ch06 + learn-claude-code s02                     │
│ buildTool() · Zod Schema · 14步执行 · 权限7模式 · 并发安全      │
│ "给 Agent 一双手，同时确保它不会弄伤自己"                         │
├──────────────────────────────────────────────────────────────┤
│ Layer 1: Agent Loop                                           │
│ Claude Code ch05 + learn-claude-code s01                     │
│ while(tool_use) · AsyncGenerator · 流式 · 错误恢复 · Terminal │
│ "一切从这里开始 — 一个循环，一个工具"                            │
└──────────────────────────────────────────────────────────────┘
```

## 学完五层的能力全景

| 能力 | 之前（只有 Layer 1-4） | 现在（加 Layer 5） |
|------|---------------------|-------------------|
| 理解 Agent 循环 | 🟢 | 🟢 |
| 设计 Tool System | 🟢 | 🟢 |
| 上下文压缩策略 | 🟢 | 🟢 |
| 多 Agent 编排 | 🟡 | 🟡 |
| 构建 AI 产品 UI | 🔴 不会 | 🟢 |
| 客户端工具执行 | 🔴 不会 | 🟢 |
| Generative UI 渲染 | 🔴 不会 | 🟢 |
| 多 Provider 前端 | 🔴 不会 | 🟡 |
| 从前端到 Agent 全链路 | 🔴 断裂 | 🟢 完整 |

## 三条成长路径更新

**路径 A — Harness 工程师**：深入 Claude Code 源码 + AI SDK Core，理解 Agent Loop 的两种设计哲学。能自己设计 Agent 系统，选型 generateText vs query()。

**路径 B — AI-Native 产品工程师**：AI SDK UI + Claude Code 的设计模式。能做出有 Generative UI 的商业产品。**这是五层完整后新增的能力。**

**路径 C — 基础设施工程师**：MCP 协议 + Worktree 隔离 + Tool Builder 模式 + Provider 抽象。打造团队级 AI 工具平台。

## 和之前评估的差异

之前评估：「前端 AI 应用 5 层架构」只是一个理论框架，Layer 5 是空的。

现在 Layer 5 有了具体内容：
- useChat + parts-based 渲染 = 如何渲染 AI 的流式输出
- 客户端工具执行 = AI 如何操作 UI
- outputSchema = 前端如何获得类型安全
- Provider 抽象 = 如何支持多模型

> 五层学完，你不仅能看懂 Claude Code 怎么造 Agent，也能用 AI SDK 把 Agent 变成产品。从前端到后端，从理论到实践，完整闭环。
