# 模块 3+4：TodoWrite + Subagent

## 模块 3：TodoWrite — 让模型自己规划

### 教学版（s03_todo_write.py）

核心模式：
- 模型通过 TodoWrite 工具自己维护任务列表
- 状态：`pending` → `in_progress` → `completed`
- Nag reminder：如果 `rounds_since_todo >= 3`，注入提醒

```
+-----------------------+
| TodoManager state     |
| [ ] task A            |
| [>] task B ← doing   |   每轮检查 rounds_since_todo
| [x] task C            |   >= 3 → 注入 <reminder>
+-----------------------+
```

### 生产版（TodoWriteTool）

```typescript
// sdk-tools.d.ts — 生产版的 TodoWrite
export interface TodoWriteInput {
  todos: {
    content: string;     // 任务描述
    status: "pending" | "in_progress" | "completed";
    activeForm: string;  // ← spinner 里显示的动作描述（"Running tests"）
  }[];
}

export interface TodoWriteOutput {
  oldTodos: Todo[];      // 更新前
  newTodos: Todo[];      // 更新后 — 用于 diff 展示
  verificationNudgeNeeded?: boolean;  // 是否需要验证提醒
}
```

关键设计差异：
- 生产版有 `activeForm` 字段 — 不仅追踪状态，还告诉 UI 当前正在做什么
- `oldTodos` + `newTodos` — 允许 UI 做 diff 展示
- `verificationNudgeNeeded` — 不是简单的 3 轮 nag，而是基于语义判断

---

## 模块 4：Subagent — 上下文隔离

### 教学版（s04_subagent.py）

```
Parent agent                     Subagent
+------------------+             +------------------+
| messages=[...]   |             | messages=[]      |  ← fresh context
|                  |  dispatch   |                  |
| tool: task       | ---------->| while tool_use:  |
|   prompt="..."   |            |   call tools     |
|                  |  summary   |                  |
|   result = "..." | <--------- | return last text |
+------------------+             +------------------+
```

关键设计：
- Fresh `messages=[]` 隔离上下文
- 过滤工具（子 agent 不能递归 spawn）
- 只返回摘要，上下文丢弃
- 安全限制：30 轮最大循环

### 生产版（AgentTool）

```typescript
// tools/AgentTool/runAgent.ts
import { query } from '../../query.js'  // ← 调用同一个 query()！

// Agent 工具的核心：创建一个新的 toolUseContext，然后调 query()
// 子 Agent 就是主 Agent Loop 的一个递归调用
```

**Agent 工具目录的关键文件：**
- `runAgent.ts` — 核心：创建 subagent context，调用 query()
- `forkSubagent.ts` — 进程/线程级隔离（fork 模式）
- `resumeAgent.ts` — 恢复暂停的 agent
- `loadAgentsDir.ts` — 从 `.claude/agents/` 目录加载 agent 定义
- `builtInAgents.ts` — 内置 agent 类型
- `agentMemory.ts` — Agent 的持久化记忆
- `agentMemorySnapshot.ts` — 记忆快照

**Agent 定义的关键字段：**
```typescript
// AgentInput (from sdk-tools.d.ts)
description: string;           // 3-5 词描述
prompt: string;                // 任务 prompt
subagent_type?: string;        // agent 类型
model?: "sonnet" | "opus" | "haiku";
run_in_background?: boolean;   // 后台运行
name?: string;                 // 命名（可通过 SendMessage 通信）
isolation?: "worktree";        // 目录级隔离
mode?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan";
```

**Agent 输出的两种状态：**
```typescript
// 完成状态
{ status: "completed", agentId, content: [...], totalToolUseCount, usage }
// 异步启动状态
{ status: "async_launched", agentId, description, prompt, outputFile }
```

## 前端启示

1. **Subagent = 递归调用同一个 query 函数，换个 context** — 前端可以用 Web Worker 实现相同模式
2. **Fresh context 是最强的隔离** — 不共享 messages 数组，子 agent 不会污染父 agent 的上下文
3. **Agent 类型系统 + 工具过滤** — 不同 agent 类型可以有不同的工具集和能力边界
4. **异步 Agent 状态管理** — `async_launched` → polling `outputFile` → `completed`。前端 AI 应用也需要这个模式
