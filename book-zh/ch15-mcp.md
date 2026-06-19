# 第 15 章：MCP — 通用工具协议

## 为什么是 MCP

在 MCP（Model Context Protocol）之前，每个 agent 框架有自己定义和发现工具的方式。一行工具是 Anthropic 特有的。另一行是 OpenAI 特有的。另一行是 LangChain 特有的。开发者必须为每个 platform rewrite 工具集成。

MCP 改变了这一点。它是工具发现和调用的标准化协议。为一个 MCP 客户端构建的工具适用于任何 MCP 客户端。Claude Code 实现了一个最完整的 MCP 客户端。

## 八种传输类型

Claude Code 支持八种 MCP 传输类型以使 MCP 服务器在任何地方都工作：

| 传输 | 协议 | 用例 |
|----------|----------|---------|
| stdio | 子进程 stdin/stdout | 本地服务器 |
| SSE | Server-Sent Events | 远程服务器、基于 Web 的 |
| HTTP | REST 风格 | 通用远程 |
| WebSocket | 双向 | 实时服务器 |
| SDK | 进程内 | 嵌入的服务器 |
| IDE（两个变种）| IDE 桥接 | IDE 集成 |
| Claude.ai 代理 | 代理 | 远程连接 |

每种传输类型包装为标准 `Tool` 对象——来自 MCP 服务器的工具对模型的查看方式与内置工具完全相同。

## 工具包装

MCP 集成不只是暴露原始 MCP 工具。它包装它们：

- **Schema 翻译**：MCP 的 JSON Schema 被翻译为 Zod schema
- **进度报告**：MCP 进度通知成为 agent 可见的进度事件
- **错误处理**：MCP 错误被翻译为标准的 tool_result 错误
- **结果预算**：MCP 结果受制于与其他工具相同的 `maxResultSizeChars` 约束

## OAuth for MCP

一些 MCP 服务器需要认证。Claude Code 实现了一个完整的 MCP OAuth 流程：客户端注册、授权码流程、token 刷新。这使得 MCP 能够连接到需要用户同意的第三方服务。

## 动态工具注册

MCP 服务器可以在运行时出现和消失——`pending` MCP 服务器被异步连接，在准备好时添加其工具。工具注册表动态更新。模型在每次轮次中看到当前的工具集，而不是启动时的快照。

## Apply This

1. **MCP 是通用协议。** 如果你在定义自定义工具协议，你可能在犯错误。MCP 足够好了，并且正在变得更好。
2. **包装外部工具。** 当集成外部工具时，包装它们——不要暴露原始接口。添加进度报告、错误翻译和结果预算。
3. **异步连接 MCP 服务器。** 不要在启动时阻塞等待 MCP 服务器连接。将它们显示为 "pending"，并在准备好时添加工具。
4. **OAuth 是 MCP 的超能力。** 标准化的 OAuth 支持意味着 MCP 工具可以安全连接到第三方服务。不要跳过它。
5. **工具对模型来说都是相同的。** 内置工具、skill 工具和 MCP 工具对模型来说应该不可区分。统一接口使得交换 provider 变得容易而不改变行为。
