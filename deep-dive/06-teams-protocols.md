# 模块 9+10：Agent Teams + Team Protocols

## 模块 9：Agent Teams — 多模型协作

### 教学版（s09_agent_teams.py，403行）

```
.team/config.json            .team/inbox/
+--------------------+       +------------------+
| team_name: "..."   |       | alice.jsonl      |  ← 每个 agent 独立收件箱
| members: [         |       | bob.jsonl        |     append-only 写入
|   {name, role,     |       | lead.jsonl       |     drain 读取
|    status}         |       +------------------+
| ]                  |
+--------------------+       消息类型：
                             message | broadcast |
Thread 隔离:                 shutdown_request |
  alice → agent_loop        shutdown_response |
  bob   → agent_loop        plan_approval_response
  lead  → agent_loop (main)
```

核心设计：
- **JSONL inbox**：append-only 写入，drain 读取（读完清空）
- **Thread 隔离**：每个 teammate 跑在独立线程，拥有独立消息历史
- **状态机**：idle → working → idle/shutdown
- **MessageBus**：`send(sender, to, content, msg_type)` + `read_inbox(name)`

### 生产版：Swarm 系统（utils/swarm/，19 个文件）

```
utils/swarm/
├── teamHelpers.ts              # 团队 CRUD（spawnTeam, cleanup）
├── spawnInProcess.ts           # 进程内 spawn
├── spawnUtils.ts               # spawn 工具函数
├── teammateInit.ts             # teammate 初始化
├── teammateModel.ts            # teammate 模型选择
├── teammatePromptAddendum.ts   # teammate 额外 prompt
├── teammateLayoutManager.ts    # teammate 布局管理
├── permissionSync.ts           # 权限同步
├── leaderPermissionBridge.ts   # leader↔teammate 权限桥接
├── reconnection.ts             # 重连机制
├── It2SetupPrompt.tsx          # iTerm2 设置提示
├── constants.ts                # 常量（TEAM_LEAD_NAME 等）
├── backends/
│   ├── PaneBackendExecutor.ts  # iTerm2 pane backend
│   ├── TmuxBackend.ts          # tmux backend
│   ├── ITermBackend.ts         # iTerm backend
│   ├── it2Setup.ts             # iTerm2 设置
│   ├── teammateModeSnapshot.ts # teammate mode 快照
│   ├── registry.ts             # backend 注册表
│   └── types.ts                # backend 类型
```

**关键发现：** 生产版的 Agent 团队不只有一种通信方式。有 3 种 backend（iTerm2 pane、tmux、进程内），每个 teammate 可以在独立的终端窗口中运行。

### TeamCreate 工具

```typescript
// teamHelpers.ts
inputSchema = z.strictObject({
  operation: z.enum(['spawnTeam', 'cleanup']),
  agent_type: z.string().optional(),    // team lead 角色
  team_name: z.string().optional(),     // 团队名
  description: z.string().optional(),   // 团队描述
})

// 输出
type SpawnTeamOutput = {
  team_name: string
  team_file_path: string
  lead_agent_id: string
}
```

### 生产版 vs 教学版的关键差异

| 维度 | 教学版 | 生产版 |
|------|--------|--------|
| 通信方式 | JSONL 文件 inbox | 多 backend（tmux pane / iTerm2 pane / in-process） |
| 隔离级别 | Python Thread | Thread + Process + Pane |
| 权限模型 | 无 | permissionSync + leaderPermissionBridge |
| 重连 | 无 | reconnection.ts |
| 布局 | 无 | teammateLayoutManager（管理终端窗口布局） |

---

## 模块 10：Team Protocols — 结构化握手

### 教学版（s10_team_protocols.py，484行）

两个协议，同一个 `request_id` 关联模式：

**Shutdown 协议：**
```
Lead → shutdown_request { request_id: abc } → Teammate
Teammate → shutdown_response { request_id: abc, approve: true/false } → Lead
Lead 收到 approve → status → "shutdown" → thread stops
```

**Plan Approval 协议：**
```
Teammate → plan_approval submit { plan: "..." } → Lead
Lead → plan_approval review { request_id: abc, approve: true/false } → Teammate
```

### 生产版：Workflow 系统 + Plan Mode

生产版比教学版多了一层 **Workflow 系统**：

```typescript
// 来自 sdk-tools.d.ts
export interface ExitPlanModeInput {
  allowedPrompts?: {
    tool: "Bash";
    prompt: string;  // e.g. "run tests", "install dependencies"
  }[];
}

export interface ExitPlanModeOutput {
  plan: string | null;
  planWasEdited?: boolean;       // 用户在 CCR web UI 中编辑了 plan
  awaitingLeaderApproval?: boolean;  // teammate → leader approval flow
  requestId?: string;              // request_id 关联模式
}
```

**Workflow 的 Pipeline/Parallel 模式：**
- `pipeline()` — 无 barrier 的多阶段流水线（item A 在 stage 3 时 item B 还在 stage 1）
- `parallel()` — barrier 式并行（等所有完成后继续）
- `phase()` — 进度分组

## 前端启示

1. **多 Agent 通信 = inbox 模式**：每个 agent 一个收件箱，append-only 写入，drain 读取
2. **request_id 关联模式是微服务中最成熟的异步通信模式**：Agent 间通信也应该用
3. **状态机管理 Agent 生命周期**：idle → working → shutdown，明确的状态转换
4. **Multi-backend 隔离**：Agent 不共享内存，通信通过 inbox；前端可以用 iframe + postMessage 实现
5. **Plan Approval 是安全关键设计**：AI 执行高风险操作前需要确认，这在前端也是必需的
