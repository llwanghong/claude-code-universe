# 第 8 章：创建子 Agent

## 智能的乘法

单个 agent 是强大的。它可以读文件、编辑代码、运行测试、搜索网页，并对结果进行推理。但单个 agent 在单次对话中有一个硬上限：上下文窗口填满，任务分支到需要不同能力的方向，工具执行的串行特性成为瓶颈。解决方案不是更大的模型。是更多的 agent。

Claude Code 的子 agent 系统让模型请求帮助。当父 agent 遇到可能受益于委托的任务时——不应污染主对话的代码库搜索、需要对抗性思维的验证、可以并行运行的独立编辑——它调用 `Agent` 工具。该调用产生一个子 agent：一个完全独立的 agent，有自己的对话循环、工具集、权限边界和 abort 控制器。

这不是便利功能。它是从并行文件探索到 coordinator-worker 层次结构到多 agent swarm 团队的所有事物的架构基础。它都流经两个文件：`AgentTool.tsx`（定义模型面向接口）和 `runAgent.ts`（实现生命周期）。

## AgentTool 定义

`AgentTool` 以名称 `"Agent"` 注册，带有遗留别名 `"Task"`（用于向后兼容旧转录、权限规则和 hook 配置）。

### 输入 Schema

基本字段：
| 字段 | 类型 | 必需 | 目的 |
|------|------|------|------|
| `description` | `string` | 是 | 3-5 词简要任务描述 |
| `prompt` | `string` | 是 | agent 的完整任务描述 |
| `subagent_type` | `string` | 否 | 使用哪个专用 agent |
| `model` | `enum('sonnet','opus','haiku')` | 否 | 此 agent 的模型覆盖 |
| `run_in_background` | `boolean` | 否 | 异步启动 |

完整 schema 添加了多 agent 参数：
| 字段 | 类型 | 目的 |
|------|------|------|
| `name` | `string` | 使 agent 可通过 `SendMessage({to: name})` 寻址 |
| `team_name` | `string` | 用于生成的团队上下文 |
| `mode` | `PermissionMode` | 生成的 teammate 的权限模式 |
| `isolation` | `enum('worktree','remote')` | 文件系统隔离策略 |

Schema 由 feature flags 动态塑造——模型永远不会看到它无法使用的字段。

### 输出 Schema

输出是一个有两个公共变体的可辨识联合类型：
- `{ status: 'completed', ... }` — 同步完成
- `{ status: 'async_launched', agentId, outputFile, ... }` — 后台启动确认

## 15 步 runAgent 生命周期

`runAgent()` 函数在 `runAgent.ts` 中实现了完整的子 agent 生命周期：

1. **解析 Agent 定义**：从内置类型或 `.claude/agents/` 目录加载
2. **构建 system prompt**：基础 prompt + agent 特定指令
3. **解析模型**：agent 定义覆盖 → 默认模型 → 父模型
4. **创建权限上下文**：从父级继承，应用 mode 覆盖
5. **设置 abort 控制器**：链接到父级的 abort 信号
6. **创建文件状态缓存**：隔离的文件读取缓存
7. **过滤工具集**：根据 agent 定义的白名单/黑名单
8. **处理 MCP 连接**：agent 特定的 MCP 服务器
9. **应用 frontmatter hooks**：从 agent 定义注册 hooks
10. **构建 ToolUseContext**：组装完整的上下文对象
11. **执行 subagent start hooks**：生命周期钩子
12. **调用 query()**：核心递归——子 agent loop 就是另一个 query() 调用
13. **清理资源**：终止 shell 任务，注销遥测
14. **处理结果**：格式化输出，保存转录
15. **返回**：返回到父 agent 的 tool_result

## 六种内置 Agent 类型

- **general-purpose**：全能型子 agent，访问所有工具
- **Explore**：只读搜索 agent，用于代码库探索
- **Plan**：软件架构师 agent，用于设计实现计划
- **claude-code-guide**：知识库 agent，用于回答关于 Claude Code 本身的问题
- **statusline-setup**：配置 agent，单任务用途
- **code-review**：代码审查 agent，分析 diff

## Apply This

**1. 子 agent = 递归调用同一个 query 函数，换一个 context。** 不需要单独的代码路径。递归使整个堆栈可测试且功能一致。

**2. Agent 类型是带过滤工具集的 parameterization。** 不要为每种 agent 写新代码。用 allowlist/denylist 参数化工具集。

**3. 强制权限边界。** 子 agent 默认不允许的权限，父 agent 必须显式授予。这不应该是可选的。

**4. 生命周期必须清理一切。** Abort 控制器、shell 任务、文件句柄、遥测注册。任何泄漏都会在数百个子 agent 中累积。

**5. Schema 应由 feature flags 动态塑造。** 如果功能关闭，从 schema 中移除字段。模型不能误用它看不到的东西。
