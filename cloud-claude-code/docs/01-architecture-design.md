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

系统从外到内分为五个平面（Plane），每层只与相邻层通信，不跨层调用：

1. **Access Plane（接入层）** — 用户交互入口。Web App（React + SSE）、IDE Extension（VSCode/JetBrains）、CLI Client（thin proxy + WebSocket）三种形态共享同一后端 API Gateway
2. **Control Plane（管控层）** — 请求调度中枢。Auth Service（SSO 认证 + JWT 签发）、Session Manager（会话状态机 + Redis 热存储）、Agent Orchestrator（意图识别 + Coordinator 模式 + Worker Pool）、Model Router（项目敏感级别路由 + 私有/外部模型 fallback）、Permission Engine（ch06 7 种模式 + 6 步决策链 + 审批流）
3. **Execution Plane（执行层）** — Agent 运行时。每会话独立 K8s Pod（含 async generator query loop、14 步 tool pipeline、4 层 context compaction），挂载 CoW overlay workspace 和 gVisor 沙箱
4. **Data Plane（数据层）** — 持久化存储。MinIO/S3（对话历史 JSONL + Memory Markdown）、Redis（会话热状态 TTL 24h）、Milvus/Qdrant（代码向量索引）、PostgreSQL（用户/权限）、ClickHouse（不可变审计日志）
5. **Integration Plane（集成层）** — 外部系统对接。Git Service 抽象层（GitLab/Bitbucket）、Build Service 抽象层（Jenkins/GitLab CI）、MCP Server Registry（内部工具注册与发现）、Notification Service（Slack/飞书/邮件/Jira）

:::diagram CloudArchitectureDiagram:::

**关键设计**：Access 不知道 Agent Pod 的存在，Data 不知道用户是谁。Control Plane 是所有请求的必经之路——它决定"谁可以在哪个项目上用什么模型做什么操作"。

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

Web 应用是三种交互形态中最完整的一种。左侧为可折叠文件树，展示仓库结构并支持点击 @mention 引用文件到对话。右侧主区域从上到下依次为：流式对话视图（实时渲染 Markdown + 代码 Diff）、权限确认弹窗（出现于危险操作时）、以及 Prompt 输入框（支持 @file 自动补全和 / 命令面板）。会话支持多 Tab 并行切换。

关键功能：
- **文件树**：浏览仓库结构，点击 @mention 直接引用文件到对话
- **Diff 视图**：工具编辑的变更以 side-by-side diff 显示（monaco-editor）
- **权限对话框**：危险操作弹出确认，继承 ch06 的 7 种权限模式
- **工具状态**：实时显示运行中的工具（spinner + 进度）
- **会话 Tabs**：多个会话并行切换

---

## 4. Control Plane — 管控层

### 4.1 Auth Service（认证服务）

认证是整个平台的安全入口。所有用户通过企业 SSO（Okta/Azure AD/LDAP）登录，Auth Service 校验身份后签发 JWT（access token 15min + refresh token 8h）。JWT claims 中包含 userId、teamId、role 和 projects 列表，下游所有服务通过 JWT 完成无状态鉴权。RBAC 定义了四种角色：Admin（平台管理）、TeamLead（团队管理 + 审批）、Developer（日常开发）、Viewer（只读访问）。

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

每个用户对话对应一个 Session。Session Manager 维护一个状态机：Idle → Active → Compacting → Completed。核心能力包括：(1) 会话持久化到 Object Storage（对话历史 JSONL 格式，继承 ch08 sidechain 转录模式）；(2) 热状态存 Redis（TTL 24h），支持毫秒级会话恢复；(3) 多会话并行（同一用户可在不同 Tab 中处理不同项目）；(4) 会话共享（团队成员可加入同一会话进行协作）。

**持久化策略**：
- 对话历史 → Object Storage（JSONL 格式，继承 ch08 sidechain 转录）
- 活跃状态 → Redis（TTL 24h，热数据快速访问）
- Memory 索引 → Object Storage（Markdown，继承 ch11）

### 4.3 Agent Orchestrator（Agent 编排器）

编排器负责将用户请求转化为 Agent 执行计划。进入时先由小模型做意图识别——单步任务直接由主 Agent 执行，多步复杂任务进入 Coordinator 模式。Coordinator 将任务分解为 Research → Synthesis → Implementation → Verification 四个阶段，每个阶段可并行生成多个 Worker Agent。Worker Pool 受项目配额限制（最大并发数），每个 Worker 有独立生命周期（create → execute → cleanup），超时 10min 自动终止。

### 4.4 Model Router（模型路由器）

模型路由根据项目安全级别自动选择推理后端。public 和 internal 项目走外部 API（Anthropic/OpenAI，能力最强但数据需脱敏后发送）；restricted 项目走私有化部署模型（DeepSeek/LLaMA on GPU Node Pool，数据不出集群）。所有请求经过统一的 Prompt 增强层：注入公司编码规范、安全策略和项目上下文。外部 API 不可用时自动 fallback 到私有模型。

路由规则：
- `public` → 外部 API（开源项目，无敏感数据）
- `internal` → 外部 API + 数据脱敏（公司内部但非机密）
- `restricted` → 私有模型（核心业务代码，数据不出集群）
- Fallback：外部 API 不可用时自动切到私有模型

### 4.5 Permission Engine（权限引擎）

权限引擎是整个安全架构中最频繁被调用的组件——每个工具调用都要经过它。我们继承 Claude Code ch06 的成熟设计，并增加了企业环境所需的组织级规则和审批流。

**7 种权限模式（继承 ch06）**：

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| `default` | 每次危险操作都询问 | 新用户、新项目默认 |
| `acceptEdits` | 自动接受文件编辑（Write/Edit），其他仍询问 | 信任 Agent 改代码 |
| `plan` | Agent 只读，所有写入阻止 | 代码审查、学习 |
| `dontAsk` | 所有操作静默执行（最高信任） | CI/CD 自动化 |
| `bypassPermissions` | 跳过权限检查（仅管理员） | 紧急操作 |
| `auto` | 根据规则自动决定 | 日常开发主力 |
| `bubble` | 遇到高权限操作时切换到默认模式 | 渐进式信任 |

**企业扩展**：在 ch06 基础上增加了三层组织级规则：

```typescript
// server/src/control/permission-engine.ts

export type PermissionLevel = 'platform' | 'team' | 'project'

export interface PermissionRule {
  id: string
  level: PermissionLevel      // 优先级：platform > team > project
  priority: number
  match: {
    tool?: string             // 工具名，如 "Bash"
    pattern?: string          // 匹配模式，如 "git push*"
    projectId?: string
    environment?: string
  }
  decision: 'allow' | 'deny' | 'ask'
  reason: string               // 决策理由（审计用）
}

// 示例：平台级规则（安全团队强制）
const platformRule: PermissionRule = {
  id: 'plat-001',
  level: 'platform',
  priority: 0,                 // 最高优先级
  match: {
    tool: 'Bash',
    pattern: 'rm -rf *',       // 禁止递归删除
  },
  decision: 'deny',
  reason: 'Block recursive delete — platform security policy',
}

// 团队级规则
const teamRule: PermissionRule = {
  id: 'team-auth-001',
  level: 'team',
  priority: 100,
  match: {
    tool: 'Deploy',
    environment: 'production',
  },
  decision: 'ask',
  reason: 'Production deployment requires team lead approval',
}

// 项目级规则（来自 .claude/rules.yaml）
const projectRule: PermissionRule = {
  id: 'proj-001',
  level: 'project',
  priority: 200,
  match: {
    tool: 'Bash',
    pattern: 'git status*',
  },
  decision: 'allow',
  reason: 'git status is always safe',
}
```

**6 步权限决策链**：每一步都有完整的错误处理和审计日志。

```
Step 1: Hook Decision  → PreToolUse Hook 最先运行（allow/deny/modify/context）
Step 2: Rule Matching  → 平台级 > 团队级 > 项目级，alwaysDeny 直接阻止
Step 3: Tool Check     → 工具的 checkPermissions() 方法（含业务逻辑）
Step 4: Mode Default   → 7 种模式默认行为
Step 5: Interactive    → Web/IDE/CLI 权限对话框（30s 超时默认 deny）
Step 6: Approval Flow  → 高风险操作 → Jira/飞书审批 ticket
```

**审批流**：对 `DeployTool`、`DBTool(write)`、`K8sTool` 等高风险操作，自动创建审批 ticket。审批对象在 Web/IDE/邮件/飞书中收到通知 → 查看详情（PR 链接、构建状态、变更 Diff）→ Approve / Reject。审批超时默认 24h，2 人 Approve 后 Agent 继续执行。完整流程见 03-security.md。

---

## 5. Execution Plane — 执行层

### 5.1 Agent Runtime 容器设计

每个用户会话对应一个独立的 K8s Pod，Pod 内部运行完整的 Agent 环境：query() Loop（async generator，继承 ch05）、Tool Pipeline（14 步执行流水线，继承 ch06）、Context Manager（4 层压缩 + circuit breaker）。Pod 内挂载 CoW workspace 卷（仓库代码）和 gVisor 沙箱（Shell 执行）。这样做而非共享进程的原因：安全隔离（一个 session 的 shell 命令不影响其他）、资源独立（CPU/内存限额按 Pod）、故障隔离（一个 Pod crash 不影响其他用户）、可观测（每个 Pod 独立日志/metrics）。代价是冷启动 2-5s，通过 Warm Pool 预热缓解。

**关键设计决策**：每会话一个 Pod，不是共享进程。理由：
- 安全隔离：一个会话的 shell 命令不会影响另一个
- 资源独立：CPU/内存限额按 Pod 执行
- 故障隔离：一个 Pod crash 不影响其他用户
- 可观测：每个 Pod 独立日志/metrics

代价是启动延迟（2-5s），通过 Warm Pool 预热解决。

### 5.2 Repository Workspace 管理

代码仓库采用分层缓存架构：底层是 Repo Cache（bare repos on SSD），上层每个 Agent Pod 通过 git clone --shared --reference 快速创建 CoW overlay workspace。这意味着：(1) 同项目多个 Agent session 共享底层 bare repo，不重复 clone；(2) CoW overlay 保证各 Agent 的修改互不影响；(3) Agent 所有修改在临时分支上（agent-{uuid}），不污染主分支；(4) Session 结束后 TTL 自动清理（默认 24h）。

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

安全架构采用 6 层纵深防御：Layer 1 (Network) — K8s NetworkPolicy 最小权限 + Ingress 仅 Gateway 暴露 + Egress 白名单 + mTLS。Layer 2 (Auth) — SSO/OIDC + MFA + JWT + Service Account + API Key。Layer 3 (Authorization) — RBAC 四角色 + Project ACL + Tool Permission（7 modes）。Layer 4 (Isolation) — 独立 Pod + gVisor 沙箱 + CoW workspace + Seccomp 禁用危险 syscall。Layer 5 (Data) — Vault 密钥管理 + Encryption at rest + PII 脱敏 + 每 Session 独立临时 Token。Layer 6 (Audit) — ClickHouse 不可变审计日志 + 告警规则（权限异常、沙箱逃逸、非工作时间 restricted 访问）。

---

## 9. 部署拓扑

### 9.1 K8s 集群布局

K8s 集群包含四个 Node Pool：Control Plane Pool（API Gateway、Auth、Session、Orchestrator 等服务，Deployment x3 保证高可用）、Agent Pool（弹性伸缩，每 session 一个 Pod，gVisor 沙箱 + Workspace Volume）、GPU Pool（vLLM/TGI 推理服务，运行 DeepSeek/LLaMA 等私有模型，独立伸缩策略）、Data Pool（PostgreSQL、Redis Cluster、MinIO/S3、Milvus/Qdrant）。伸缩策略：最小 Warm Pool 5 pods（热启动 <1s）、最大按团队配额（默认 20/team）、空闲 10min 自动销毁。

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

交付目标：单用户可登录 Web，选择 Git 仓库，与 Agent 对话。包含：API Gateway + SSO Auth、单 Agent Runtime（query loop + 基础工具集 Read/Write/Edit/Grep/Bash）、Git 集成（clone + workspace）、Web 基础对话界面、外部 API 接入（Anthropic）。

### Phase 2：生产就绪（2-3 个月）

交付目标：多用户可用，安全控制完备，IDE 插件可用。包含：Agent Orchestrator（多 Agent + Coordinator 模式）、Shell Sandbox 升级（gVisor/Firecracker）、权限系统完整版（7 模式 + 审批流）、Memory 系统（4 层，继承 ch11）、私有模型接入（GPU Node Pool + vLLM）、IDE Extensions（VSCode + JetBrains）、可观测性（Prometheus + Jaeger + ClickHouse）。

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
