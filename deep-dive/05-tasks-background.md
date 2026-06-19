# 模块 7+8：Persistent Tasks + Background Tasks

## 模块 7：Persistent Tasks — 跨会话状态

### 教学版（s07_task_system.py）

JSON 文件持久化 + 依赖图：

```
.tasks/
  task_1.json  {"id":1, "subject":"...", "status":"completed"}
  task_2.json  {"id":2, "blockedBy":[1], "status":"pending"}
  task_3.json  {"id":3, "blockedBy":[2]}

Dependency resolution:
  completing task 1 → removes it from task 2's blockedBy
  task 2 becomes unblocked → agent can claim it
```

核心洞察：**"State that survives compression — because it's outside the conversation."**

### 生产版（tasks/ 目录，8 种 Task 类型）

```
tasks/
├── LocalAgentTask/           # 本地 Agent 任务
├── LocalShellTask/           # 本地 Shell 后台任务（117行）
├── LocalMainSessionTask.ts   # 主会话任务
├── RemoteAgentTask/          # 远程 Agent 任务
├── InProcessTeammateTask/    # 进程内 teammate 任务
├── DreamTask/                # "梦想"任务（后台持续运行）
├── stopTask.ts               # 停止任务
├── pillLabel.ts              # 标签渲染
└── types.ts                  # 任务类型定义
```

每种 Task 都是独立类型，有自己的状态机和生命周期。

---

## 模块 8：Background Tasks — 异步执行

### 教学版（s08_background_tasks.py）

```
Main thread                Background thread
+-----------------+        +-----------------+
| agent loop      |        | task executes   |
| ...             |        | ...             |
| [LLM call] <---+------- | enqueue(result) |
|  ^drain queue   |        +-----------------+
+-----------------+

流程：
1. agent 调用 background_run("long command")
2. 立即返回 task_id，后台线程启动
3. 后续每轮 LLM 调用前 drain notification queue
4. 任务完成后结果注入到 messages
```

### 生产版（BashOutput 的真实字段）

```typescript
// sdk-tools.d.ts — BashOutput
export interface BashOutput {
  stdout: string;
  stderr: string;
  interrupted: boolean;
  isImage?: boolean;
  
  // 后台任务相关
  backgroundTaskId?: string;        // 后台任务 ID
  backgroundedByUser?: boolean;     // 用户 Ctrl+B 手动后台
  assistantAutoBackgrounded?: boolean; // 助手自动后台长命令
  
  // 大结果持久化
  persistedOutputPath?: string;     // 结果太大 → 写入文件
  persistedOutputSize?: number;
  rawOutputPath?: string;           // MCP 工具的大结果
  
  // 沙箱
  dangerouslyDisableSandbox?: boolean;
}
```

**后台任务的完整生命周期：**

```
User/Agent starts bash:
  → run_in_background = true
  → 返回 { backgroundTaskId: "abc123" }

Agent continues working:
  → 每轮 drain notification queue
  → 有新结果 → 注入到 messages

Agent queries task output:
  → TaskOutput({ task_id, block: true/false, timeout })
  → block=true 时等待完成
  → block=false 时立即返回当前状态

Agent stops task:
  → TaskStop({ task_id })
  → 终止后台进程
```

### TaskOutput 工具

```typescript
// sdk-tools.d.ts
export interface TaskOutputInput {
  task_id: string;
  block: boolean;      // 是否等待完成
  timeout: number;     // 最大等待时间 (ms)
}
```

**关键设计：**
- `run_in_background` + `TaskOutput` 让 Agent 不必阻塞等待长命令
- `assistantAutoBackgrounded` 让系统自动将长命令转为后台
- `backgroundedByUser` 让用户手动将正在执行的命令转为后台
- 大结果自动持久化到文件（`persistedOutputPath`），不占用上下文

## 前端启示

1. **状态应该外化到文件/数据库，不依赖对话历史**：跨会话才能恢复
2. **异步操作 = 立即返回 handle + 轮询结果**：`Promise` + `TaskOutput` 的语义
3. **依赖图是强大的任务编排原语**：`blockedBy` 让 agent 自己管理执行顺序
4. **大结果自动持久化**：不要把所有数据塞进 context，超阈值就写文件
5. **前端 AI 应用需要同样的 Task 系统**：IndexedDB + AI 任务状态机
