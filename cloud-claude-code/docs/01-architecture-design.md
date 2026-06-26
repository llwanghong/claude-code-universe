# 云端 Claude Code — 总体架构设计

> 版本：v1.0 | 日期：2026-06-26 | 状态：设计评审中

## 1. 背景与目标

### 1.1 为什么做这个

Claude Code 是当前最成熟的 AI 编程 Agent，但它的设计假设是"单用户、本地终端、一个模型 provider"。企业环境需要的是"多用户、云端部署、多种模型、对接内部系统"。

我们在 [claude-code-universe](https://llwanghong.github.io/claude-code-universe/) 中深入研究了 Claude Code 的 18 章源码架构。这个项目的目标是：**把学到的架构知识应用到企业场景中，设计一个可以实际落地的方案**。

### 1.2 约束条件

| 维度 | 约束 |
|------|------|
| 基础设施 | 自建 K8s + GitLab/Bitbucket + Jenkins/GitLab CI |
| 模型选型 | 混合方案 — 敏感项目用私有模型（数据不出网），一般项目用外部 API |
| 用户交互 | Web + VSCode/JetBrains 插件 + CLI，全部支持 |
| 安全合规 | 企业 SSO、RBAC、审批流、审计日志 |

### 1.3 设计原则

1. **继承而非重造** — Claude Code 中已验证的模式（generator loop、14-step tool pipeline、async sub-agents）直接继承
2. **云端原生** — 每会话独立容器、CoW workspace、弹性伸缩
3. **纵深防御** — 6 层安全，不信任任何一层
4. **渐进上线** — 3 个 Phase 逐步交付，每个 Phase 可独立验证

---

## 2. 总体架构：五层平面

:::diagram CloudArchitectureDiagram:::

**关键设计**：每层只与相邻层通信，不跨层调用。Access 不知道 Agent Pod 的存在，Data 不知道用户是谁。

---

## 3. Access Plane — 用户入口层

### 3.1 三种接入方式

| 形态 | 技术栈 | 适用场景 |
|------|--------|---------|
| **Web App** | React 19 + SSE streaming | 非开发角色、code review、轻度使用 |
| **IDE Extension** | VSCode Extension API + JetBrains Plugin SDK | 日常开发主力 |
| **CLI Client** | Thin proxy → cloud WebSocket | 高级用户、脚本化、CI 集成 |

传输层继承 Claude Code ch16 的设计：**reads 走持久连接（SSE/WebSocket），writes 走 HTTP POST**。

原因：streaming token 是高频低延迟的（每秒 10-50 条消息），需要持久连接。用户输入和工具调用是低频的（每分钟几次），HTTP POST 足够。统一到一个 WebSocket 反而增加耦合。

### 3.2 Web 应用核心布局


关键功能：
- **文件树**：浏览仓库结构，点击 @mention 直接引用文件到对话
- **Diff 视图**：工具编辑的变更以 side-by-side diff 显示（monaco-editor）
- **权限对话框**：危险操作弹出确认，继承 ch06 的 7 种权限模式
- **工具状态**：实时显示运行中的工具（spinner + 进度）
- **会话 Tabs**：多个会话并行切换

---

## 4. Control Plane — 管控层

### 4.1 Auth Service（认证服务）


JWT claims 包含：
```json
{
  "sub": "user-123",
  "email": "dev@company.com",
  "teams": ["platform", "payments"],
  "role": "developer",
  "projects": ["project-a", "project-b"],
  "permissions": ["code:read", "code:write", "deploy:staging"]
}
```

### 4.2 Session Manager（会话管理）


**持久化策略**：
- 对话历史 → Object Storage（JSONL 格式，继承 ch08 sidechain 转录）
- 活跃状态 → Redis（TTL 24h，热数据快速访问）
- Memory 索引 → Object Storage（Markdown，继承 ch11）

### 4.3 Agent Orchestrator（Agent 编排器）


### 4.4 Model Router（模型路由器）


路由规则：
- `public` → 外部 API（开源项目，无敏感数据）
- `internal` → 外部 API + 数据脱敏（公司内部但非机密）
- `restricted` → 私有模型（核心业务代码，数据不出集群）
- Fallback：外部 API 不可用时自动切到私有模型

### 4.5 Permission Engine（权限引擎）

继承 Claude Code ch06 的 7 种权限模式，增加企业维度：


**审批流**：对 `DeployTool`、`DBTool(write)`、`K8sTool` 等高风险操作，自动创建审批 ticket。

---

## 5. Execution Plane — 执行层

### 5.1 Agent Runtime 容器设计


**关键设计决策**：每会话一个 Pod，不是共享进程。理由：
- 安全隔离：一个会话的 shell 命令不会影响另一个
- 资源独立：CPU/内存限额按 Pod 执行
- 故障隔离：一个 Pod crash 不影响其他用户
- 可观测：每个 Pod 独立日志/metrics

代价是启动延迟（2-5s），通过 Warm Pool 预热解决。

### 5.2 Repository Workspace 管理


### 5.3 工具系统

继承 Claude Code ch06 的 Tool 接口，扩展云端工具：

```typescript
// 继承 ch06 的 Tool 接口
interface CloudTool<I, O, P> extends Tool<I, O, P> {
  // 云端扩展
  requiredPermission?: 'read' | 'write' | 'admin'
  requiresApproval?: boolean            // 是否需要审批
  approvalTicketType?: 'jira' | 'feishu' // 审批系统
  sandboxRequired?: boolean             // 是否必须沙箱内执行
  maxExecutionTime?: number             // 超时（ms）
  allowedEnvironments?: string[]        // 允许的目标环境
}

// 示例：DeployTool
const DeployTool: CloudTool = buildTool({
  name: 'Deploy',
  description: 'Trigger deployment to target environment',
  inputSchema: z.object({
    environment: z.enum(['staging', 'production']),
    version: z.string(),
  }),
  requiredPermission: 'admin',
  requiresApproval: true,            // ← 需要审批
  approvalTicketType: 'jira',
  sandboxRequired: true,
  maxExecutionTime: 600_000,         // 10min
  async call(input) {
    // 调用 Jenkins/GitLab CI API
  }
})
```

### 5.4 Shell Sandbox

```yaml
# Agent Pod 安全上下文
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true     # 根文件系统只读
  allowPrivilegeEscalation: false

# 网络策略
networkPolicy:
  egress:
    - to: [internal-registry.com]  # 仅允许内网
    - to: [api.anthropic.com]      # 外部 API（仅 public/internal）
  ingress: []                      # 不允许入站

# 资源限制
resources:
  limits:
    cpu: "2"
    memory: "4Gi"
    ephemeral-storage: "10Gi"
  requests:
    cpu: "500m"
    memory: "1Gi"

# 超时
commandTimeout: 300  # 单个命令最长 5min
sessionTimeout: 3600 # 会话最长 1h
```

---

## 6. Data Plane — 数据层

### 6.1 存储选型

| 数据类型 | 存储 | 理由 |
|---------|------|------|
| 对话历史 | MinIO/S3 (JSONL) | ch08 sidechain 模式，追加写、不可变 |
| Memory 文件 | MinIO/S3 (Markdown) | ch11 模式，透明、人类可读 |
| 会话状态 | Redis | 热数据，TTL 24h |
| 代码索引 | Milvus/Qdrant | 向量搜索，语义匹配 |
| 用户/权限 | PostgreSQL | 结构化查询、ACID |
| Audit Log | ClickHouse | 时序数据、高写入吞吐 |
| Prompt Cache | Redis | KV 缓存，低延迟 |

---

## 7. 集成层

### 7.1 代码仓库 — Git Service 抽象层

```typescript
interface GitService {
  clone(url: string, ref?: string): Promise<Workspace>
  fetch(ws: Workspace): Promise<void>
  checkout(ws: Workspace, ref: string): Promise<void>
  diff(ws: Workspace): Promise<DiffResult>
  createBranch(ws: Workspace, name: string): Promise<void>
  createPR(ws: Workspace, title: string, body: string): Promise<PR>
  search(query: string): Promise<SearchResult[]>
}

class GitLabService implements GitService { /* ... */ }
class BitbucketService implements GitService { /* ... */ }
```

### 7.2 CI/CD — Build Service 抽象层

```typescript
interface BuildService {
  triggerBuild(project: string, branch: string): Promise<Build>
  getBuildLog(buildId: string): AsyncGenerator<string>
  getBuildStatus(buildId: string): Promise<BuildStatus>
  triggerDeploy(env: string, version: string): Promise<Deployment>
  getDeployStatus(deployId: string): Promise<DeployStatus>
}
```

---

## 8. 安全架构

### 8.1 纵深防御 6 层


---

## 9. 部署拓扑

### 9.1 K8s 集群布局


---

## 10. 与 Claude Code 源码的映射

这个架构的每个关键模块都能回溯到源码研究中的对应章节：

| 云端模块 | 对应章节 | 继承的设计模式 |
|---------|---------|---------------|
| Agent Loop | ch05 | `async function* query()` + 10 终端状态 + 7 继续状态 |
| Tool Pipeline | ch06 | 14 步执行流水线 + 7 种权限模式 + 结果预算 |
| Concurrent Execution | ch07 | `partitionToolCalls()` 贪心分区 + 推测执行 |
| Sub-agents | ch08 | `runAgent()` 15 步生命周期 + 6 种内置类型 |
| Fork & Cache | ch09 | 逐字节相同前缀 + placeholder 结果 + 递归防护 |
| Coordination | ch10 | Task 状态机 + Coordinator 模式 + Swarm |
| Memory | ch11 | 4 类型分类法 + 文件基存储 + LLM 副查询召回 |
| Extensibility | ch12 | Skills 2 阶段加载 + Hooks 快照安全模型 |
| MCP | ch15 | 8 种 Transport + OAuth 发现 + 工具包装 |
| Remote Control | ch16 | 非对称读写 + BoundedUUIDSet + 自动恢复 |
| Performance | ch17 | 26 位位图预过滤器 + Slot Reservation + Sticky Latch |

---

## 11. 实施路线图

### Phase 1：核心可用（2-3 个月）


### Phase 2：生产就绪（2-3 个月）


---

## 12. 关键决策记录

| 决策 | 选择 | 替代方案 | 选择理由 |
|------|------|---------|---------|
| Agent 隔离 | 每会话一 Pod | 共享进程池 | 安全隔离最强，故障不传播 |
| Workspace | CoW overlay + 临时分支 | 直接 clone | 多 agent 共享 bare repo，修改隔离 |
| 模型路由 | 项目敏感级别 | 统一私有模型 | 平衡安全与能力，非敏感项目能用更强模型 |
| Memory 存储 | Object Storage Markdown | 数据库 | 透明、可编辑、可版本控制（继承 ch11） |
| 消息传输 | WebSocket/SSE read + HTTP write | 纯 WebSocket | 继承 ch16 设计，读写解耦 |
| 沙箱 | gVisor/Firecracker | Docker only | 额外内核级隔离，防止容器逃逸 |
| 权限模型 | ch06 7 模式 + 审批流 | 自建 RBAC | 继承成熟设计，减少设计风险 |
