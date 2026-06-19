# S05：MCP — 通用工具协议

> 对应：书 ch15 | 源码：services/mcp/

## MCP 是什么

Model Context Protocol — 工具发现和调用的标准协议。像一个工具的 "HTTP"：不管你用什么 agent 框架，只要你说 MCP，工具就能互操作。

## 八种传输类型

Claude Code 支持 8 种 MCP 传输，从 stdio（子进程）到 SSE（Server-Sent Events）到 WebSocket 到 IDE 桥接。

关键设计：外部工具统一包装为标准 `Tool` 对象。内置工具和 MCP 工具对模型来说不可区分。

## 前端启示

1. **MCP 是 AI 工具的标准。** 如果你在构建 AI 工具，实现 MCP 兼容性。一次实现，适用于所有 agent
2. **包装 = 添加进度、错误处理、结果限制。** 不要暴露原始外部接口
3. **在 AI UI 中，MCP 工具 = 组件。** 每个 MCP 工具调用可以在前端渲染为交互式卡片
4. **异步连接。** 不要阻塞 MCP 服务器连接的启动。在准备好时增量添加工具
5. **OAuth for MCP 是游戏规则改变者。** 工具可以安全地访问第三方服务，无需开发者共享密钥
