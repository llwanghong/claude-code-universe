# 第 12 章：可扩展性 — Skills 与 Hooks

## 两阶段 Skill 加载

Skills 是 agent 可以按需加载的领域专业知识。系统使用两阶段加载以避免系统提示膨胀。

**阶段 1：启动时（便宜）。** 只有 skill 元数据（名称、描述、触发条件）被注入系统提示。每个 skill 约 100 个 token。即使有 50 个 skill 注册，这也是约 5K 个 token——可管理的。元数据在启动时加载一次，并且像其他缓存前缀内容一样受益于 prompt cache。

**阶段 2：调用时（完整知识）。** 当模型调用 `Skill(skill_name)` 时，完整的 `SKILL.md` 文件内容作为 tool_result 返回。模型获得完整的指令集——逐步指南、API 参考、最佳实践——完全注入到对话中。

这就像分页：启动时只有目录。模型在需要时请求完整的章节。

### Skill 格式

每个 skill 是一个带有 YAML frontmatter 的 `SKILL.md` 文件：

```yaml
---
name: pdf-processing
description: Extract text, merge documents, fill forms
---
# PDF Processing Guide

## Step 1: Validate the PDF
...
```

Frontmatter 提供元数据。Body 提供指令。Registration 扫描 `skills/` 目录，解析 frontmatter，并将 skill 添加到系统提示。完整内容在模型调用工具时按需加载。

### 动态 Skill 发现

除了显式调用，系统还在特定条件下触发自动 skill 发现。当检测到某些模式时，skill 发现机制可能建议相关 skill。随着模型能力的增长，系统的这一部分变得不那么重要——现代模型足够聪明，可以自己识别何时需要 skill。

### Skill 预取

在第 5 章介绍的 Skill 预取在后台运行，与模型流式输出重叠。当 agent 写入文件（可能触发 skill 发现）时，发现过程在不阻塞主循环的情况下启动。大多数轮次不产生匹配，所以预取通常什么都不做——但在它确实发现匹配时，结果在模型完成响应时就已经就绪。

---

## Hooks：生命周期拦截

### 27 个事件，4 种类型

Hooks 在 27 个不同的生命周期点触发：

| 类型 | 数量 | 示例事件 | 可以做什么 |
|------|------|---------|----------|
| Shell hooks | 4 | `PreToolUse`、`PostToolUse` | 阻止或修改工具执行 |
| Prompt hooks | 4 | `PrePrompt`、`PostPrompt` | 修改 LLM 调用 |
| Session hooks | 12 | `SessionStart`、`PreCompact`、`PostCompact` | 注入上下文，修改压缩 |
| Agent hooks | 7 | 子 agent 生命周期事件 | 跟踪 agent 创建/销毁 |

### Hook 执行模型

**外部 Hooks：** 作为子进程生成。通过 stdin 上的 JSON 接收上下文。通过退出码（0 = 成功，2 = 阻止）和 stdout 上的 JSON 返回决策。开销：每次调用几毫秒，但隔离保证值得——一个崩溃的 hook 不会搞垮 agent。

**内部回调：** 用于性能关键路径。一个 `-70%` 的快速路径绕过子进程生成，在进程内运行。API 表面是相同的——唯一的区别是调用的地方。系统知道开销的重要性，并有选择地将快速路径应用于热路径。

### 快照安全模型

在启动时，hook 配置被读取并冻结为不可变快照。在会话期间对磁盘上 hook 配置文件的修改将被忽略。这防止攻击者在接受信任对话框后修改 hook 规则。

Hook configuration 文件在启动时读取一次。结果是一个不可变快照。后续对磁盘上文件的写入——恶意的或其他——不会影响活跃会话的安全态势。重启后，新的配置生效。

对于 `sessionStart` hooks，有一个例外：它们在快照后立即运行，在信任边界建立之后但在任何工具执行之前，允许基于会话的初始化逻辑。

### PreToolUse Hooks 和权限

PreToolUse hooks 是权限*之前*的权限。它们在交互式权限提示出现之前运行。如果一个 PreToolUse hook 返回 `allow` 或 `deny`，该决定是最终的——用户永远不会看到提示。这使得 hooks 适合实施组织策略（"永远不允许向生产数据库写入"），同时留下交互式提示用于逐案的开发者判断。

Hook 配置支持条件匹配：仅在工具名称匹配模式时运行，仅在命令内容匹配正则表达式时运行，仅在特定文件被修改时运行。这支持细粒度策略而不需要为每种可能的情况编写自定义逻辑。

---

## Apply This

**两阶段加载：先元数据，后完整内容。** 不要预先加载所有内容。让模型在看到目录后决定加载什么。这节省上下文并使 prompt cache 保持稳定——新 skill 仅添加几行元数据，而不是数千行指令。

**Hooks 应该是外部进程。** 进程隔离 + stdin/stdout/exit code = 自 1971 年以来稳定的协议。hook 崩溃不会搞垮 agent。hook 泄漏的内存在其进程退出时消失。对于每个调用花费的几毫秒是值得的。

**在启动时快照 hook 配置。** 冻结安全决策。会话期间的更改应该在重启时才生效，而不是在运行时。安全性不能被运行时文件编辑破坏。

**内部回调用于热路径。** 当性能至关重要时，绕过子进程产生。但保持相同的 API 表面。让快与慢成为一个实现细节，而不是一个 API 差异。

**PreToolUse hooks 用于策略执行。** 在用户看到提示之前阻止操作。使用条件匹配实现细粒度规则。Hooks 是扩展 agent 的安全边界而不分叉代码的最强大方式。
