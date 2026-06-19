# 模块 11+12：Autonomous Agents + Worktree Isolation

## 模块 11：Autonomous Agents — 自主循环

### 教学版（s11_autonomous_agents.py，586行）

```
Teammate lifecycle:
+-------+
| spawn |
+---+---+
    |
    v
+-------+  tool_use    +-------+
| WORK  | <----------- |  LLM  |
+---+---+              +-------+
    |
    | stop_reason != tool_use
    v
+--------+
| IDLE   | poll every 5s for up to 60s
+---+----+
    |
    +---> check inbox → message? → resume WORK
    +---> scan .tasks/ → unclaimed? → claim → resume WORK
    +---> timeout (60s) → shutdown
```

关键设计：
- **Idle 循环**：完成任务后不退出，而是进入 poll 循环
- **自动 Claim**：扫描任务板，发现未认领的任务就自动认领并执行
- **Identity re-injection**：压缩后重新注入 "You are 'coder', role: backend"
- **优雅关闭**：idle 60s 无新工作 → shutdown

### 生产版：CronCreate + ScheduleWakeup

生产版没有 idle poll 循环，而是用**定时器机制**：

```typescript
// CronCreateTool.ts
inputSchema = z.strictObject({
  cron: z.string().describe(
    'Standard 5-field cron expression: "M H DoM Mon DoW"'
  ),
  prompt: z.string().describe('The prompt to enqueue at each fire time.'),
  recurring: semanticBoolean(z.boolean().optional()).describe(
    'true = fire on every cron match; false = fire once then auto-delete'
  ),
  durable: semanticBoolean(z.boolean().optional()).describe(
    'true = persist to .claude/scheduled_tasks.json and survive restarts'
  ),
})
```

**生产版自主唤醒的工作方式：**

```
1. Agent 调用 CronCreate
   → cron: "*/5 * * * *" （每 5 分钟）
   → prompt: "check CI status and report"
   → durable: true （持久化到磁盘）

2. Harness 的 Cron 引擎
   → 每分钟检查 scheduled_tasks.json
   → 匹配当前时间的任务 → 触发
   → Recurring 任务下次再调度
   → One-shot 任务触发后删除

3. 触发时
   → 注入一个新的 user message
   → 启动 agent loop
   → Agent 执行 prompt 描述的任务
```

**关键差异：**
- 教学版：Agent 自己 idle poll（在 agent loop 内等待）
- 生产版：Harness 负责调度（Agent 不消耗资源 idle 等待）

---

## 模块 12：Worktree Isolation — 并行安全

### 教学版（s12_worktree_task_isolation.py，782行）

```
.tasks/task_12.json
  { "id": 12, "subject": "Implement auth refactor",
    "status": "in_progress", "worktree": "auth-refactor" }

.worktrees/index.json
  { "worktrees": [{
      "name": "auth-refactor",
      "path": ".../.worktrees/auth-refactor",
      "branch": "wt/auth-refactor",
      "task_id": 12,
      "status": "active"
  }] }
```

核心洞察：**"Isolate by directory, coordinate by task ID."**

### 生产版：EnterWorktreeTool + ExitWorktreeTool

```typescript
// EnterWorktreeTool.ts
async call(input) {
  // 1. 验证不重复进入 worktree
  if (getCurrentWorktreeSession()) {
    throw new Error('Already in a worktree session')
  }
  // 2. 生成/验证 worktree slug
  validateWorktreeSlug(input.name)
  // 3. 通过 git 或 hooks 创建隔离目录
  const worktreePath = await createWorktreeForSession(input.name)
  // 4. 切换 CWD
  setCwd(worktreePath)
  // 5. 保存状态到 session storage
  saveWorktreeState(...)
}

// ExitWorktreeTool.ts
async call(input) {
  // action: "keep" | "remove"
  // discard_changes: boolean（有未提交的更改时需确认）
  // 恢复原始 CWD
  setCwd(originalCwd)
  // 清理或保留 worktree
}
```

**Worktree 不只是 git 操作：**
- 支持自定义 hooks（非 git 环境也能创建隔离目录）
- Session storage 保存/恢复状态
- CWD 切换 + plan 目录切换
- `discard_changes` 保护：有未提交修改时拒绝删除

**EnterWorktreeOutput：**
```typescript
{ worktreePath, worktreeBranch?, message }
```

**ExitWorktreeOutput：**
```typescript
{ action: "keep" | "remove", originalCwd, worktreePath, 
  worktreeBranch?, tmuxSessionName?, discardedFiles?, discardedCommits?, message }
```

## 前端启示

1. **自主 Agent = 定时器 + 任务板，不是 idle poll**：Harness 负责调度，Agent 不浪费资源等待
2. **任务板 + 自动 Claim 是无锁任务分配的经典模式**：Web Worker pool 也可以用
3. **Durable cron tasks**：`durable: true` → 持久化到磁盘，跨会话存活。前端的 Service Worker + IndexedDB 可以实现类似模式
4. **目录级隔离是最强的一致性保证**：多个 Agent 并行工作时，各自拥有独立的文件系统
5. **Identity re-injection**：压缩后的 Agent 需要重新注入身份信息。前端 AI 应用压缩对话历史后也要恢复关键上下文
6. **Isolate by directory, coordinate by task ID** — 这个原则在前端可以用 `iframe sandbox + postMessage` 实现
