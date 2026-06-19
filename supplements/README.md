# 补充资料

这些文件填补了 deep-dive 笔记与 Claude Code from Source 全书之间的空白。deep-dive 笔记侧重于与 learn-claude-code 教学版直接对应的主题，而 supplements 覆盖了教学版没有涉及但在生产架构中至关重要的主题。

| 文档 | 主题 | 对应书章 | 对应源码 |
|------|------|----------|----------|
| [S01](./S01-bootstrap-and-state.md) | 启动流水线 + 双层状态 | ch02 + ch03 | bootstrap/state.ts |
| [S02](./S02-api-layer-and-cache.md) | API 层 + Prompt Cache + Fork | ch04 + ch09 | services/api/ |
| [S03](./S03-concurrent-tool-execution.md) | 并发工具执行 | ch07 | services/tools/StreamingToolExecutor.ts |
| [S04](./S04-terminal-ui-and-input.md) | 终端 UI + 输入交互 | ch13 + ch14 | ink/, components/ |
| [S05](./S05-mcp-transports.md) | MCP 8 种传输 | ch15 | services/mcp/ |
| [S06](./S06-remote-control.md) | 远程控制 | ch16 | bridge/, remote/ |
| [S07](./S07-performance-engineering.md) | 性能工程 | ch17 | utils/profilerBase.ts |

每个文件包含核心模式摘要、与 Claude Code 真实源码的对照，以及可操作的前端启示。
