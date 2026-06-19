# 第 8 章：创建子 Agent

## 智能的乘法

单个 agent 是强大的。它可以读文件、编辑代码、运行测试、搜索网页，并对结果进行推理。但单个 agent 在单次对话中有一个硬上限：上下文窗口填满，任务分支到需要不同能力的方向，工具执行的串行特性成为瓶颈。解决方案不是更大的模型。是更多的 agent。

Claude Code 的子 agent 系统让模型请求帮助。当父 agent 遇到可能受益于委托的任务时——不应污染主对话的代码库搜索、需要对抗性思维的验证、可以并行运行的独立编辑——它调用 `Agent` 工具。该调用产生一个子 agent：一个完全独立的 agent，有自己的对话循环、自己的工具集、自己的权限边界和自己的 abort 控制器。子 agent 做它的工作并返回结果。父 agent 永远不会看到子 agent 的内部推理，只看到最终输出。

这不是便利功能。它是从并行文件探索到协调器-工人层次结构到多 agent swarm 团队的所有事物的架构基础。它都流经两个文件：`AgentTool.tsx`，定义模型面向接口，和 `runAgent.ts`，实现生命周期。

设计挑战是显著的。子 agent 需要足够的上下文来完成工作，但又不能太多以至于在不相关的信息上浪费 token。它需要足够严格以保证安全的权限边界，但又足够灵活以便有用。它需要生命周期管理来清理它触及的每个资源，而不要求调用者记住要清理什么。所有这些必须适用于一系列 agent 类型——从一个廉价、快速、只读的 Haiku 搜索器到一个昂贵、彻底、Opus 驱动的在后台运行对抗性测试的验证 agent。

本章追踪从模型的"我需要帮助"到一个完全运行中的子 agent 的路径。我们将检查模型看到的工具定义、创建执行环境的十五步生命周期、六种内置 agent 类型及其各自优化目标、让用户定义自定义 agent 的 frontmatter 系统，以及从这一切浮现出的设计原则。

关于术语的说明：贯穿本章，"父"指的是调用 `Agent` 工具的 agent，"子"指的是被生成的 agent。父通常是（但不总是）顶级 REPL agent。在协调器模式中，协调器生成工人，工人是子 agent。在嵌套场景中，子 agent 本身可以生成孙 agent——同样的生命周期递归适用。

编排层大约跨越 `tools/AgentTool/`、`tasks/`、`coordinator/`、`tools/SendMessageTool/` 和 `utils/swarm/` 中的 40 个文件。本章专注于生成机制——AgentTool 定义和 runAgent 生命周期。下一章覆盖运行时：进度跟踪、结果获取和多 agent 协调模式。

---

## AgentTool 定义

`AgentTool` 以名称 `"Agent"` 注册，遗留别名 `"Task"` 用于向后兼容旧版转录、权限规则和 hook 配置。它是用标准的 `buildTool()` 工厂构建的，但它的 schema 比系统中任何其他工具都更动态。

### 输入 Schema

输入 schema 通过 `lazySchema()` 惰性构造——我们在第 6 章见过的模式，将 zod 编译推迟到首次使用。有两层：一个基础 schema 和一个添加多 agent 和隔离参数的完整 schema。

基础字段始终存在：

| 字段 | 类型 | 必需 | 目的 |
|------|------|------|------|
| `description` | `string` | 是 | 3-5 词简要任务描述 |
| `prompt` | `string` | 是 | agent 的完整任务描述 |
| `subagent_type` | `string` | 否 | 使用哪个专用 agent |
| `model` | `enum('sonnet','opus','haiku')` | 否 | 此 agent 的模型覆盖 |
| `run_in_background` | `boolean` | 否 | 异步启动 |

完整 schema 添加了多 agent 参数（当 swarm 功能活跃时）和隔离控制：

| 字段 | 类型 | 目的 |
|------|------|------|
| `name` | `string` | 使 agent 可通过 `SendMessage({to: name})` 寻址 |
| `team_name` | `string` | 生成的团队上下文 |
| `mode` | `PermissionMode` | 生成的 teammate 的权限模式 |
| `isolation` | `enum('worktree','remote')` | 文件系统隔离策略 |
| `cwd` | `string` | 工作目录的绝对路径覆盖 |

多 agent 字段使 swarm 模式成为可能（第 10 章）：命名 agent 可以在并发运行时通过 `SendMessage({to: name})` 互相发送消息。隔离字段使文件系统安全：worktree 隔离创建一个临时的 git worktree，因此 agent 在仓库的副本上操作，当多个 agent 同时处理相同代码库时防止冲突编辑。

使这个 schema 不寻常的是它**由 feature flags 动态塑造**：

```typescript
// Pseudocode — illustrates the feature-gated schema pattern
inputSchema = lazySchema(() => {
  let schema = baseSchema()
  if (!featureEnabled('ASSISTANT_MODE')) schema = schema.omit({ cwd: true })
  if (backgroundDisabled || forkMode)    schema = schema.omit({ run_in_background: true })
  return schema
})
```

当 fork 实验活跃时，`run_in_background` 从 schema 中完全消失，因为在该路径下所有生成都强制异步。当后台任务被禁用（通过 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`），该字段也被移除。当 KAIROS feature flag 关闭时，`cwd` 被省略。模型永远不会看到它不能使用的字段。

这是一个微妙但重要的设计选择。Schema 不仅仅是验证——它是模型的指令手册。Schema 中的每个字段都在模型读取的工具定义中被描述。移除模型不应使用的字段比向 prompt 中添加"不要使用此字段"更有效。模型不能误用它看不到的东西。

### 输出 Schema

输出是一个有两个公共变体的可辨识联合类型：

- `{ status: 'completed', prompt, ...AgentToolResult }` — 同步完成，包含 agent 的最终输出
- `{ status: 'async_launched', agentId, description, prompt, outputFile }` — 后台启动确认

另外两个内部变体（`TeammateSpawnedOutput` 和 `RemoteLaunchedOutput`）存在但被排除在导出的 schema 之外，以便在外部构建中启用死代码消除。当相应的 feature flags 被禁用时，打包器会剥离这些变体及其关联的代码路径，保持分发的二进制文件更小。

`async_launched` 变体值得注意的是它包含的内容：`outputFile` 路径，当 agent 完成时结果将写入该路径。这让父 agent（或任何其他消费者）可以轮询或监听文件以获取结果，提供一个在进程重启后仍然存活的基于文件系统的通信通道。

### 动态 Prompt

`AgentTool` prompt 由 `getPrompt()` 生成并且是上下文敏感的。它根据以下因素调整：可用 agent（内联列出或作为附件以避免破坏 prompt cache）、fork 是否活跃（添加"何时 fork"指导）、会话是否处于协调器模式（精简 prompt，因为协调器系统 prompt 已经涵盖用法）、以及订阅层级。非 Pro 用户会收到关于并发启动多个 agent 的说明。

当 agent 列表作为附件发送时，工具描述返回静态文本，真实的 agent 列表被注入为 `agent_listing_delta` attachment message。这是约 10.2% 机群 cache_creation token 的来源——MCP 异步连接、`/reload-plugins` 或权限模式变化会改变列表→描述改变→完整工具 schema 缓存破坏。

---

## 15 步 runAgent 生命周期

`runAgent()` 函数在 `runAgent.ts` 中实现了完整的子 agent 生命周期：

### 1. 获取 Agent 定义

来自内置类型或 `.claude/agents/` 目录。定义指定 agent 类型、系统 prompt 添加内容、工具白名单/黑名单、模型偏好和 frontmatter hooks。

### 2. 构建 System Prompt

Base system prompt + agent 特定指令 + 环境详情。Prompt 在生成时组装一次，并冻结为 `renderedSystemPrompt` 用于 fork 子 agent——重新渲染可能因 feature flag 预热而发散并破坏 prompt cache 共享。

### 3. 解析模型

Agent 定义覆盖 → 用户 CLI 覆盖 → 系统默认。当 agent 定义指定了一个模型时，该模型具有最高优先级。用户可以通过在 `Agent` 工具调用中传递 `model` 参数进一步覆盖。

### 4. 创建权限上下文

从父级继承权限模式，应用来自 agent 调用的 `mode` 覆盖。默认子 agent 模式是 `bubble`——它们不能自我批准危险操作；权限请求向上传播到父级。

### 5. 设置 Abort 控制器

子 agent 获得一个链接到父级 abort 信号的新 `AbortController`。当父 agent 被取消时（Ctrl+C、stop hook、token budget 耗尽），子 agent 也被取消。当子 agent 需要比父级活得更久时（如后台 agent），abort 链接是可选的。

### 6. 创建文件状态缓存

为子 agent 的文件读取创建一个隔离的 LRU 缓存。防止子 agent 的读取模式污染父 agent 的缓存驱逐策略。

### 7. 过滤工具集

Agent 定义的白名单和黑名单确定子 agent 可以访问哪些工具。规则：
- 白名单存在 → 只包括列出的工具
- 黑名单存在 → 包括除被拒绝的工具外的所有工具
- 两者存在 → 白名单减去黑名单
- 都不存在 → 继承完整工具集（除 Agent 工具外，以防止无界递归）

### 8. 处理 MCP 连接

子 agent 继承父 agent 的 MCP 连接（除非另有配置）。MCP 服务器连接是共享的，但工具包装是每 agent 的，在第 6 章描述的集中式注册表中。

### 9. 应用 Frontmatter Hooks

Agent 定义可以指定 hooks，通过 `registerFrontmatterHooks` 加载。这些 hooks 影响子 agent 运行在其中的沙箱：`PreToolUse` 限制文件系统访问，`PostToolUse` 清理临时文件。

### 10. 构建 ToolUseContext

组装完整的 `ToolUseContext`，为子 agent 做出深思熟虑的隔离选择：`setAppState` 对异步 agent 变成 no-op（没有可用的终端 UI），`localDenialTracking` 获得一个新鲜对象（不与父级共享拒绝计数），`contentReplacementState` 从父级克隆。

### 11. 执行 Subagent Start Hooks

通知 hooks 子 agent 正在生成。这些是通知 hooks，不是门控 hooks——它们不能阻止生成，但可以注入额外的日志上下文。

### 12. 调用 query()

生成递归：子 agent 运行与系统其余部分相同的 `query()` 函数。子 agent 获得自己的查询循环，有自己的消息历史、工具集和权限边界。父 agent 的 generator 在子 agent 运行时暂停。

### 13. 清理

子 agent 完成后，清理其资源：终止任何剩余的 shell 任务、在协调器模式中注销自身、从协调器的活跃 agent 跟踪中移除。

### 14. 记录遥测

子 agent 的 token 使用、成本和持续时间被记录到父级的成本追踪器和遥测系统中。子 agent 成本不是分开计费的——它们是父级会话成本的一部分。

### 15. 返回给调用者

子 agent 的最终文本被包装为一个 `ToolResult` 并作为 `Agent` 工具调用的结果返回给父 agent。父 agent 只看到输出，看不到内部对话。

---

## 六种内置 Agent 类型

| Agent 类型 | 优化目标 | 工具集 | 模型 |
|-----------|---------|--------|------|
| `general-purpose` | 灵活性 | 除 Agent 外的所有工具 | 继承主循环模型 |
| `Explore` | 只读代码库探索 | Read、Grep、Glob、Bash(readonly) | 继承；轻量任务用 Haiku |
| `Plan` | 在实现前设计架构 | Read、Grep、Glob、AskUserQuestion | Sonnet 默认 |
| `claude-code-guide` | 回答关于 Claude Code 的问题 | 只读工具 + WebFetch | 继承 |
| `statusline-setup` | 配置状态行 | Config | 任何模型 |
| `code-review` | 审查代码变更 | Read、Grep、Bash(readonly) | Sonnet 默认 |

每种类型只是工具集、系统 prompt 和模型偏好的参数化。没有专门的代码路径——相同的 `query()` 函数，相同的 `runAgent` 生命周期，不同的配置。

### 自定义 Agent（Frontmatter Hooks）

用户可以通过在 `.claude/agents/` 中放置带有 YAML frontmatter 的 Markdown 文件来定义自定义 agent：

```yaml
---
agentType: my-reviewer
whenToUse: "Use for thorough security reviews"
tools: [Read, Grep, Bash]
disallowedTools: [Edit, Write]
model: sonnet
---
```

Frontmatter hooks 系统加载这些定义并通过 `registerFrontmatterHooks` 注册它们。它们成为 agent 注册表中与其他 agent 别无二致的一等公民。

---

## Apply This

**子 agent = 递归调用相同的 query 函数，不同的上下文。** 不需要单独的代码路径。递归使整个堆栈可测试且功能一致。子 agent 继承父 agent 的所有行为（压缩、错误恢复、hook 执行），无需重复。

**Agent 类型是带过滤工具集的参数化。** 不要为每种 agent 写新代码。参数化工具集、model 偏好和 system prompt。让配置驱动行为。六种内置类型是概念的证明，不是上限。

**强制执行权限边界。** 子 agent 默认为 `bubble` 模式——它们不能自我批准危险操作。权限请求向上传播到父级或最终到达用户。这对安全是不可协商的。

**生命周期必须清理一切。** Abort 控制器、shell 任务、文件句柄、遥测注册、协调器跟踪。任何泄漏都会在数百个子 agent 中累积。在一个函数中对生命周期进行线性编码（如 `runAgent` 的 15 步），以便清理逻辑易于审计。

**Schema 应由 feature flags 动态塑造。** 如果功能关闭，从 schema 中移除字段。模型不能误用它看不到的东西。"不要在 prompt 中使用此"不如省略有效。
