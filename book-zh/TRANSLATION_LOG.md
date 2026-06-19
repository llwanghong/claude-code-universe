# 翻译追踪日志

## 源仓库映射

```
英文原文: upstream/claude-code-from-source/book/ch*.md
中文翻译: book-zh/ch*.md
上游仓库: https://github.com/alejandrobalderas/claude-code-from-source
```

## 翻译记录

| # | 中文文件 | 英文原文 | 翻译时上游 commit | 翻译日期 | 状态 |
|---|---------|---------|-------------------|---------|------|
| 1 | ch01-architecture.md | upstream/.../book/ch01-architecture.md | `a6d5e45` | 2026-06-19 | ✅ |
| 2 | ch02-bootstrap.md | upstream/.../book/ch02-bootstrap.md | `a6d5e45` | 2026-06-19 | ✅ |
| 3 | ch03-state.md | upstream/.../book/ch03-state.md | `a6d5e45` | 2026-06-19 | ✅ |
| 4 | ch04-api-layer.md | upstream/.../book/ch04-api-layer.md | `a6d5e45` | 2026-06-19 | ✅ |
| 5 | ch05-agent-loop.md | upstream/.../book/ch05-agent-loop.md | `a6d5e45` | 2026-06-19 | ✅ |
| 6 | ch06-tools.md | upstream/.../book/ch06-tools.md | `a6d5e45` | 2026-06-19 | ✅ |
| 7 | ch07-concurrency.md | upstream/.../book/ch07-concurrency.md | `a6d5e45` | 2026-06-19 | ✅ |
| 8 | ch08-sub-agents.md | upstream/.../book/ch08-sub-agents.md | `a6d5e45` | 2026-06-19 | ✅ |
| 9 | ch09-fork-agents.md | upstream/.../book/ch09-fork-agents.md | `a6d5e45` | 2026-06-19 | ✅ |
| 10 | ch10-coordination.md | upstream/.../book/ch10-coordination.md | `a6d5e45` | 2026-06-19 | ✅ |
| 11 | ch11-memory.md | upstream/.../book/ch11-memory.md | `a6d5e45` | 2026-06-19 | ✅ |
| 12 | ch12-extensibility.md | upstream/.../book/ch12-extensibility.md | `a6d5e45` | 2026-06-19 | ✅ |
| 13 | ch13-terminal-ui.md | upstream/.../book/ch13-terminal-ui.md | `a6d5e45` | 2026-06-19 | ✅ |
| 14 | ch14-input-interaction.md | upstream/.../book/ch14-input-interaction.md | `a6d5e45` | 2026-06-19 | ✅ |
| 15 | ch15-mcp.md | upstream/.../book/ch15-mcp.md | `a6d5e45` | 2026-06-19 | ✅ |
| 16 | ch16-remote.md | upstream/.../book/ch16-remote.md | `a6d5e45` | 2026-06-19 | ✅ |
| 17 | ch17-performance.md | upstream/.../book/ch17-performance.md | `a6d5e45` | 2026-06-19 | ✅ |
| 18 | ch18-epilogue.md | upstream/.../book/ch18-epilogue.md | `a6d5e45` | 2026-06-19 | ✅ |

**翻译基准 commit**: `a6d5e45` (2026-06-19)

## 更新流程

当上游 `claude-code-from-source` 有新 commit 时：

```bash
# 1. 检查上游变更
./scripts/sync-check.sh

# 2. 查看英文 diff（从翻译基准到最新）
cd upstream/claude-code-from-source
git diff a6d5e45 HEAD -- book/

# 3. 对照更新中文翻译
# 修改 book-zh/ 中对应的文件

# 4. 更新本文件中的 commit hash 和日期
```

## 跨仓库资源映射总览

```
主题                   英文书              中文书            深度笔记          learn-claude-code
──────────────────────────────────────────────────────────────────────────────────
Agent Loop            ch05                ch05               01               s01 + docs/zh/s01
Tool System           ch06                ch06               02               s02 + docs/zh/s02
Sub-agents            ch08                ch08               03               s04 + docs/zh/s04
Context Compaction    在 ch05 中         在 ch05 中          04               s06 + docs/zh/s06
Skills & Hooks        ch12                ch12               04               s05 + docs/zh/s05
Background Tasks      在 ch10 中         在 ch10 中          05               s08 + docs/zh/s08
Agent Teams           ch10                ch10               06               s09 + docs/zh/s09
Cron/Autonomous       无                 无                  07               s11 + docs/zh/s11
Worktree              ch08 (部分)          ch08 (部分)         07               s12 + docs/zh/s12
Architecture Overview ch01                ch01               08               无
Bootstrap             ch02                ch02               S01              无
State                 ch03                ch03               S01              无
API Layer             ch04                ch04               S02              无
Concurrency           ch07                ch07               S03              无
Fork Agents           ch09                ch09               S02              无
Memory                ch11                ch11               无               无
Terminal UI           ch13                ch13               S04              无
Input Interaction     ch14                ch14               S04              无
MCP                   ch15                ch15               S05              无
Remote Control        ch16                ch16               S06              无
Performance           ch17                ch17               S07              无
Epilogue              ch18                ch18               08               无

注：learn-claude-code 的 docs/zh/ 目录已包含完整的 12 步中文文档（上游自带）。
