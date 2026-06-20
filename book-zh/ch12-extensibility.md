# 第 12 章：可扩展性 — Skills 与 Hooks

## 两种扩展维度

Claude Code 提供两种扩展机制：Skills 教模型新能力（知识注入），Hooks 控制模型何时能做某事（行为控制）。它们一起让用户在不修改核心代码的情况下定制 agent 的行为。

---

## Skills：教模型新技巧

### 两阶段加载

Skills 使用两阶段加载以避免 system prompt 膨胀：

**阶段 1：启动时（便宜）。** 只有 skill 元数据（名称、描述、触发条件）被注入 system prompt。每个 skill 约 100 个 token。

**阶段 2：调用时（完整知识）。** 当模型调用 `Skill(skill_name)` 时，完整的 `SKILL.md` 文件内容作为 tool_result 返回。模型获得完整的指令集。

这就像分页：启动时只有目录。模型在需要时请求完整的章节。

### Skill 格式

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

### Skill 预取

在后台与模型流式输出重叠运行。当 agent 写入文件（可能触发 skill 发现）时，发现过程在不阻塞主循环的情况下启动。大多数轮次不产生匹配，所以预取通常什么都不做——但当它确实发现匹配时，结果在模型完成响应时就已经就绪。

---

## Hooks：控制何时发生事情

### 27 个事件，4 种类型

| 类型 | 数量 | 示例事件 | 可以做什么 |
|------|------|---------|----------|
| Shell hooks | 4 | `PreToolUse`、`PostToolUse` | 阻止或修改工具执行 |
| Prompt hooks | 4 | `PrePrompt`、`PostPrompt` | 修改 LLM 调用 |
| Session hooks | 12 | `SessionStart`、`PreCompact`、`PostCompact` | 注入上下文，修改压缩 |
| Agent hooks | 7 | 子 agent 生命周期事件 | 跟踪 agent 创建/销毁 |

### 外部 Hooks 执行模型

外部 hooks 作为子进程生成。通过 stdin 上的 JSON 接收上下文。通过退出码（0 = 成功，2 = 阻止）和 stdout 上的 JSON 返回决策。开销：每次调用几毫秒，但隔离保证值得——一个崩溃的 hook 不会搞垮 agent。

内部回调用于性能关键路径。一个 `-70%` 的快速路径绕过子进程生成，在进程内运行。相同的 API 表面——唯一的区别是调用的地方。

### 快照安全模型

在启动时，hook 配置被读取并冻结为不可变快照。在会话期间对磁盘上 hook 配置文件的修改将被忽略。这防止攻击者在接受信任对话框后修改 hook 规则。

> 💡 **译注**：攻击场景：1）你 cd 到一个克隆的开源项目。2）Claude Code 问"信任这个目录吗？"你点了"是"。3）但 `.claude/hooks.json` 里藏了恶意 hook。4）快照模式意味着 hook 配置在你点信任*之前*就被读取冻结了。恶意修改对当前会话无效。

### PreToolUse Hooks 和权限

PreToolUse hooks 是权限*之前*的权限。它们在交互式权限提示出现之前运行。如果 hook 返回 `allow` 或 `deny`，该决定是最终的——用户永远不会看到提示。Hook 配置支持条件匹配：仅在工具名称匹配模式时运行，仅在命令内容匹配正则表达式时运行。这支持细粒度策略而不需要为每种可能的情况编写自定义逻辑。

---

## Apply This

**两阶段加载：先元数据，后完整内容。** 不要预先加载所有内容。让模型在看到目录后决定加载什么。这节省上下文并使 prompt cache 保持稳定。

**Hooks 应该是外部进程。** 进程隔离 + stdin/stdout/exit code = 自 1971 年以来稳定的协议。对每个调用花费的几毫秒是值得的。内部回调用于热路径，但保持相同的 API 表面。

**在启动时快照 hook 配置。** 冻结安全决策。会话期间的更改应该在重启时才生效，而不是在运行时。安全性不能被运行时文件编辑破坏。

**PreToolUse hooks 用于策略执行。** 在用户看到提示之前阻止操作。Hooks 是扩展 agent 的安全边界而不分叉代码的最强大方式。条件匹配支持细粒度规则而不需要自定义逻辑。
