# Cross Reference — 三资源交叉索引

按主题列出三个资源的对应关系。

> 💡 **注意**：`upstream/` 子目录是 git submodule，在 GitHub Web 上不可直接浏览。英文原版请访问：
> - 书：[claude-code-from-source.com](https://claude-code-from-source.com) 或 [GitHub](https://github.com/alejandrobalderas/claude-code-from-source/tree/main/book)
> - 教程：[shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)
> - 中文翻译可直接浏览：`book-zh/ch*.md`

## 核心架构

| 主题 | 我们的中文翻译 | 英文原版书 | 深度笔记 | 教学版 |
|------|--------------|----------|---------|--------|
| Agent Loop | [ch05](book-zh/ch05-agent-loop.md) | [ch05](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch05-agent-loop.md) | [01](deep-dive/01-agent-loop.md) | s01 |
| Tool System | [ch06](book-zh/ch06-tools.md) | [ch06](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch06-tools.md) | [02](deep-dive/02-tool-system.md) | s02 |
| Tool Concurrency | [ch07](book-zh/ch07-concurrency.md) | [ch07](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch07-concurrency.md) | [S03](supplements/S03-concurrent-tool-execution.md) | — |
| Sub-agents | [ch08](book-zh/ch08-sub-agents.md) | [ch08](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch08-sub-agents.md) | [03](deep-dive/03-todowrite-subagent.md) | s04 |
| Fork Agents | [ch09](book-zh/ch09-fork-agents.md) | [ch09](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch09-fork-agents.md) | [S02](supplements/S02-api-layer-and-cache.md) | — |
| Coordination | [ch10](book-zh/ch10-coordination.md) | [ch10](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch10-coordination.md) | [06](deep-dive/06-teams-protocols.md) | s09 |
| Memory | [ch11](book-zh/ch11-memory.md) | [ch11](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch11-memory.md) | — | — |
| Skills & Hooks | [ch12](book-zh/ch12-extensibility.md) | [ch12](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch12-extensibility.md) | [04](deep-dive/04-skills-compaction.md) | s05 |
| Context Compaction | 在 ch05 中 | 在 ch05 中 | [04](deep-dive/04-skills-compaction.md) | s06 |
| Terminal UI | [ch13](book-zh/ch13-terminal-ui.md) | [ch13](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch13-terminal-ui.md) | [S04](supplements/S04-terminal-ui-and-input.md) | — |
| Input & Keybindings | [ch14](book-zh/ch14-input-interaction.md) | [ch14](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch14-input-interaction.md) | [S04](supplements/S04-terminal-ui-and-input.md) | — |
| MCP | [ch15](book-zh/ch15-mcp.md) | [ch15](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch15-mcp.md) | [S05](supplements/S05-mcp-transports.md) | — |
| Remote Control | [ch16](book-zh/ch16-remote.md) | [ch16](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch16-remote.md) | [S06](supplements/S06-remote-control.md) | — |
| Performance | [ch17](book-zh/ch17-performance.md) | [ch17](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch17-performance.md) | [S07](supplements/S07-performance-engineering.md) | — |
| Epilogue | [ch18](book-zh/ch18-epilogue.md) | [ch18](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch18-epilogue.md) | [08](deep-dive/08-full-agent-summary.md) | — |
| Architecture Overview | [ch01](book-zh/ch01-architecture.md) | [ch01](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch01-architecture.md) | [08](deep-dive/08-full-agent-summary.md) | — |
| Bootstrap | [ch02](book-zh/ch02-bootstrap.md) | [ch02](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch02-bootstrap.md) | [S01](supplements/S01-bootstrap-and-state.md) | — |
| State | [ch03](book-zh/ch03-state.md) | [ch03](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch03-state.md) | [S01](supplements/S01-bootstrap-and-state.md) | — |
| API Layer | [ch04](book-zh/ch04-api-layer.md) | [ch04](https://github.com/alejandrobalderas/claude-code-from-source/blob/main/book/ch04-api-layer.md) | [S02](supplements/S02-api-layer-and-cache.md) | — |

## 关键设计模式

| 模式 | 书 | 深度笔记 | 教学版 |
|------|-----|---------|--------|
| AsyncGenerator as agent loop | ch05 | 01 | s01 |
| Speculative tool execution | ch07 | S03 | — |
| Concurrent-safe batching | ch07 | S03 | — |
| Fork agents for cache sharing | ch09 | S02 | — |
| 5-layer context compression | ch05 | 04 | s06 |
| File-based memory with LLM recall | ch11 | — | — |
| Two-phase skill loading | ch12 | 04 | s05 |
| Sticky latches for cache stability | ch03 | S01 | — |
| Slot reservation (8K→64K) | ch04 | S02 | — |
| Hook config snapshot | ch12 | 04 | — |

## 10 大模式速查

1. **AsyncGenerator as agent loop** → 书 ch05 + 笔记 01 + 教学 s01
2. **Speculative tool execution** → 书 ch07 + 补充 S03
3. **Concurrent-safe batching** → 书 ch07 + 补充 S03
4. **Fork agents for cache sharing** → 书 ch09 + 补充 S02
5. **4/5-layer context compression** → 书 ch05 + 笔记 04 + 教学 s06
6. **File-based memory with LLM recall** → 书 ch11
7. **Two-phase skill loading** → 书 ch12 + 笔记 04 + 教学 s05
8. **Sticky latches** → 书 ch03 + 补充 S01
9. **Slot reservation** → 书 ch04 + 补充 S02
10. **Hook config snapshot** → 书 ch12 + 笔记 04
