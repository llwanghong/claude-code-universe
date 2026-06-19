# Cross Reference — 三资源交叉索引

按主题列出三个资源的对应关系。

## 核心架构

| 主题 | 书（ch） | 深度笔记 | 教学版 | 生产源码 |
|------|---------|---------|--------|----------|
| Agent Loop | [ch05](upstream/claude-code-from-source/book/ch05-agent-loop.md) | [01](deep-dive/01-agent-loop.md) | s01_agent_loop.py | query.ts |
| Tool System | [ch06](upstream/claude-code-from-source/book/ch06-tools.md) | [02](deep-dive/02-tool-system.md) | s02_tool_use.py | Tool.ts, tools/ |
| Tool Concurrency | [ch07](upstream/claude-code-from-source/book/ch07-concurrency.md) | [S03](supplements/S03-concurrent-tool-execution.md) | — | services/tools/StreamingToolExecutor.ts |
| Sub-agents | [ch08](upstream/claude-code-from-source/book/ch08-sub-agents.md) | [03](deep-dive/03-todowrite-subagent.md) | s04_subagent.py | tools/AgentTool/ |
| Fork Agents | [ch09](upstream/claude-code-from-source/book/ch09-fork-agents.md) | [S02](supplements/S02-api-layer-and-cache.md) | — | tools/AgentTool/forkSubagent.ts |
| Coordination | [ch10](upstream/claude-code-from-source/book/ch10-coordination.md) | [06](deep-dive/06-teams-protocols.md) | s09_agent_teams.py | utils/swarm/ |
| Memory | [ch11](upstream/claude-code-from-source/book/ch11-memory.md) | — | — | utils/memory/ |
| Skills & Hooks | [ch12](upstream/claude-code-from-source/book/ch12-extensibility.md) | [04](deep-dive/04-skills-compaction.md) | s05_skill_loading.py | tools/SkillTool/, utils/hooks/ |
| Context Compaction | 在 ch05 中覆盖 | [04](deep-dive/04-skills-compaction.md) | s06_context_compact.py | services/compact/ |
| Terminal UI | [ch13](upstream/claude-code-from-source/book/ch13-terminal-ui.md) | [S04](supplements/S04-terminal-ui-and-input.md) | — | ink/, components/ |
| Input & Keybindings | [ch14](upstream/claude-code-from-source/book/ch14-input-interaction.md) | [S04](supplements/S04-terminal-ui-and-input.md) | — | keybindings/ |
| MCP | [ch15](upstream/claude-code-from-source/book/ch15-mcp.md) | [S05](supplements/S05-mcp-transports.md) | — | services/mcp/ |
| Remote Control | [ch16](upstream/claude-code-from-source/book/ch16-remote.md) | [S06](supplements/S06-remote-control.md) | — | bridge/, remote/ |
| Performance | [ch17](upstream/claude-code-from-source/book/ch17-performance.md) | [S07](supplements/S07-performance-engineering.md) | — | — |
| Epilogue | [ch18](upstream/claude-code-from-source/book/ch18-epilogue.md) | [08](deep-dive/08-full-agent-summary.md) | — | — |
| Architecture Overview | [ch01](upstream/claude-code-from-source/book/ch01-architecture.md) | [08](deep-dive/08-full-agent-summary.md) | — | — |
| Bootstrap | [ch02](upstream/claude-code-from-source/book/ch02-bootstrap.md) | [S01](supplements/S01-bootstrap-and-state.md) | — | bootstrap/ |
| State | [ch03](upstream/claude-code-from-source/book/ch03-state.md) | [S01](supplements/S01-bootstrap-and-state.md) | — | bootstrap/state.ts |
| API Layer | [ch04](upstream/claude-code-from-source/book/ch04-api-layer.md) | [S02](supplements/S02-api-layer-and-cache.md) | — | services/api/ |

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
