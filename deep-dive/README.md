# Deep Dive Notes — 前端 Harness 工程师视角

## 方法论：三层对照学习法

```
Claude Code 真实架构（what it does, 从 claude-code-src/ 读取）
        ↕ 对照
learn-claude-code 教学实现（how it's built）
        ↕ 扩展
前端工程化视角的深度解读（why it matters to you）
```

每篇文章包含：架构图 + 教学版代码 + 生产版源码对照 + 前端启示。

## 目录

| 文档 | 模块 | 主题 | 教学文件 | 生产源码 |
|------|------|------|----------|----------|
| [01](./01-agent-loop.md) | 0+1 | Agent 本质 + Agent Loop | s01_agent_loop.py | query.ts |
| [02](./02-tool-system.md) | 2 | Tool System | s02_tool_use.py | Tool.ts + 44个工具目录 |
| [03](./03-todowrite-subagent.md) | 3+4 | TodoWrite + Subagent | s03, s04 | TodoWriteTool, AgentTool |
| [04](./04-skills-compaction.md) | 5+6 | Skills + Context Compaction | s05, s06 | services/compact/ |
| [05](./05-tasks-background.md) | 7+8 | Tasks + Background Tasks | s07, s08 | tasks/ |
| [06](./06-teams-protocols.md) | 9+10 | Agent Teams + Protocols | s09, s10 | utils/swarm/ |
| [07](./07-autonomous-worktree.md) | 11+12 | Autonomous + Worktree | s11, s12 | ScheduleCronTool, EnterWorktreeTool |
| [08](./08-full-agent-summary.md) | 13 | 全景图 + 能力模型 | s_full.py | 完整架构还原 |

## 5 大能力支柱

```
Loop 能力    — Agent Loop + 流式处理 + 错误恢复
Tool 能力    — 44 个工具 + buildTool() + Zod schema
扩展能力    — Subagent + Skills + MCP
记忆能力    — 5层压缩 + 8种Task + Background
编排能力    — Swarm + 多Backend + Worktree Hooks
```

## 前端 AI 应用 5 层架构

```
Layer 5: Generative UI    ← Vercel AI SDK
Layer 4: Orchestration    ← Subagent · Team · Workflow
Layer 3: Context & Memory ← 压缩流水线 · 持久化任务
Layer 2: Tool System      ← buildTool · Zod · 权限
Layer 1: Agent Loop       ← while tool_use · 流式
```
