# 安全架构设计

> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](./01-architecture-design.md)

## 1. 威胁模型

### 1.1 我们防范什么

| 威胁 | 严重级别 | 攻击向量 |
|------|---------|---------|
| **Prompt Injection** — 代码中的恶意注释诱导 agent 执行危险操作 | 高 | 被分析的代码仓库 |
| **Tool Output Misuse** — 工具返回的内容欺骗模型 | 高 | npm/pip 包、日志输出 |
| **Sandbox Escape** — agent 执行的命令逃逸到宿主机 | 极高 | Shell 命令 |
| **Data Exfiltration** — 敏感代码通过外部 API 泄漏 | 高 | 模型 API 调用 |
| **Privilege Escalation** — 低权限用户访问高权限项目 | 中 | API 请求 |
| **Supply Chain** — 恶意 MCP 服务器或 plugin | 中 | MCP/Plugin 安装 |
| **Credential Theft** — token/密钥被 agent 或中间人窃取 | 极高 | 文件系统、环境变量、网络 |

### 1.2 信任边界

```
         信任                             不信任
  ┌──────────────┐              ┌──────────────────┐
  │ Auth Service │              │ 被分析的代码仓库   │
  │ Config DB    │              │ Agent 执行的命令   │
  │ Session Store│              │ 外部 npm/pip 包   │
  │ (平台控制)    │              │ 第三方 MCP 服务器  │
  └──────────────┘              │ 用户上传的文件     │
                                └──────────────────┘

  信任边界 = Agent Pod 的网络边界 + 模型 API 的数据边界
```

---

## 2. 纵深防御（6 层）

```
Layer 1: NETWORK ─────────────────────────────────────────────
│  K8s NetworkPolicy: Pod 间默认拒绝，仅声明式放行
│  Ingress: 仅 API Gateway Service 暴露
│  Egress: 白名单域名 + 内网 IP 段
│  mTLS: 服务间通信双向 TLS
└─────────────────────────────────────────────────────────────

Layer 2: AUTHENTICATION ──────────────────────────────────────
│  SSO/OIDC (Okta/Azure AD/LDAP) + MFA
│  JWT (access 15min + refresh 8h)
│  Service Account (服务间 mTLS + JWT)
│  API Key (CI/CD 集成，最小权限)
│  Session Token (WebSocket 连接凭证)
└─────────────────────────────────────────────────────────────

Layer 3: AUTHORIZATION ───────────────────────────────────────
│  RBAC: Admin / TeamLead / Developer / Viewer
│  Project ACL: 项目级读写权限
│  Tool Permission: 7 模式 + 工具级 deny/allow
│  Environment Gate: staging 可以直接操作，production 需审批
└─────────────────────────────────────────────────────────────

Layer 4: ISOLATION ───────────────────────────────────────────
│  Agent Pod: 每 session 独立 K8s Pod
│  gVisor (runsc): 用户态内核，拦截危险 syscall
│  CoW Workspace: 修改不污染主仓库
│  Network Sandbox: 仅允许白名单出站
│  Seccomp Profile: 禁用 ptrace/mount/module 等系统调用
└─────────────────────────────────────────────────────────────

Layer 5: DATA ────────────────────────────────────────────────
│  Vault: 所有密钥/Token 由 Vault 管理
│  Encryption at rest: S3/MinIO 存储加密
│  PII Scanning: 审计日志写入前扫描脱敏
│  Token Scope: 每个 Agent Session 独立的临时 Token
└─────────────────────────────────────────────────────────────

Layer 6: AUDIT ───────────────────────────────────────────────
│  不可变审计日志 (ClickHouse)
│  - 谁 (userId) 做了什么 (action) 对什么 (resource)
│  - 何时 (timestamp) 从哪 (IP) 结果 (outcome)
│  告警规则:
│  - 3 次权限拒绝/分钟 → 安全团队告警
│  - 沙箱异常退出 → 即时告警
│  - 非工作时间访问 restricted 项目 → 标记审查
└─────────────────────────────────────────────────────────────
```

---

## 3. 权限模型详细设计

### 3.1 权限决策流程

```
用户操作到达
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│  1. HOOK DECISION                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ PreToolUse Hook 运行                                │ │
│  │  - 可以: allow / deny / modify-input / inject-ctx  │ │
│  │  - 来源: 平台策略 / 团队配置 / 项目配置             │ │
│  │  - 如果 hook 已决定 → 直接返回，不继续后续步骤     │ │
│  └────────────────────────────────────────────────────┘ │
│                         │ 未决定                         │
│                         ▼                                │
│  2. RULE MATCHING (三层规则)                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 优先级: 平台级 > 团队级 > 项目级                    │ │
│  │                                                     │ │
│  │ alwaysDenyRules:                                    │ │
│  │   - Bash(rm -rf /*)        # 平台级，永久阻止      │ │
│  │   - Bash(curl *)           # 团队级，禁止网络请求  │ │
│  │   - Deploy(production)     # 项目级，禁止直发生产  │ │
│  │                                                     │ │
│  │ alwaysAllowRules:                                   │ │
│  │   - Bash(git *)            # 允许所有 git 命令     │ │
│  │   - Read(/src/**)          # 允许读取 src 目录     │ │
│  │   - Grep(*)                # 允许搜索              │ │
│  │                                                     │ │
│  │ alwaysAskRules:                                     │ │
│  │   - Write(/config/**)      # 配置文件需确认        │ │
│  │   - Deploy(staging)        # 部署 staging 需确认   │ │
│  └────────────────────────────────────────────────────┘ │
│                         │ 未匹配                         │
│                         ▼                                │
│  3. TOOL-SPECIFIC CHECK                                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │ tool.checkPermissions(input):                       │ │
│  │   - DBTool: 检查是否 SELECT 语句 (只读)            │ │
│  │   - DeployTool: 检查目标环境 (staging=ok,          │ │
│  │     production=审批)                                │ │
│  │   - BashTool: parseForSecurity() 分类命令          │ │
│  └────────────────────────────────────────────────────┘ │
│                         │ 未决定                         │
│                         ▼                                │
│  4. MODE DEFAULT                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 当前权限模式:                                        │ │
│  │   bypassPermissions → 允许一切                      │ │
│  │   plan → 拒绝所有写操作                             │ │
│  │   dontAsk → 自动拒绝需确认的操作                    │ │
│  │   default → 继续到步骤 5                            │ │
│  └────────────────────────────────────────────────────┘ │
│                         │ 需要用户输入                    │
│                         ▼                                │
│  5. INTERACTIVE PROMPT                                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Web: 对话框 [Allow] [Deny] [Always Allow]          │ │
│  │ IDE: 通知栏 quick pick                              │ │
│  │ CLI: 终端内交互式提示                               │ │
│  └────────────────────────────────────────────────────┘ │
│                         │ 需要审批                        │
│                         ▼                                │
│  6. APPROVAL FLOW                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 高风险操作自动创建审批 ticket:                       │ │
│  │  - Deploy(production)                               │ │
│  │  - DBTool(INSERT/UPDATE/DELETE)                     │ │
│  │  - K8sTool(apply)                                   │ │
│  │                                                     │ │
│  │ 审批流程:                                            │ │
│  │  Create Ticket → TL Review → Approve/Reject         │ │
│  │  - 超时: 30min 无响应 → 自动拒绝                    │ │
│  │  - 紧急通道: on-call 工程师可快速审批               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 规则配置示例

```yaml
# .claude/rules.yaml (项目级，版本控制)
rules:
  alwaysAllow:
    - Bash(git status*)
    - Bash(git diff*)
    - Bash(git log*)
    - Bash(npm test*)
    - Read(/src/**)
    - Grep(*)

  alwaysDeny:
    - Bash(rm -rf *)
    - Bash(sudo *)
    - Deploy(production)  # 项目策略：禁止直接发生产

  alwaysAsk:
    - Write(/src/**)
    - Edit(/src/**)
    - Bash(git push*)
    - Deploy(staging)

  toolSettings:
    DBTool:
      maxResultRows: 100
      allowedTables:
        - users
        - orders
        - products
      disallowedTables:
        - secrets
        - payment_methods
```

---

## 4. 数据安全

### 4.1 数据分类与处理

| 数据级别 | 示例 | 存储 | 传输 | 模型发送 |
|---------|------|------|------|---------|
| **Public** | 开源代码 | 明文 | HTTP | ✅ 可发送 |
| **Internal** | 内部业务代码 | 加密 | HTTPS | ✅ 脱敏后发送 |
| **Restricted** | 核心算法、密钥 | 加密 | mTLS | ❌ 仅私有模型 |
| **Secret** | 生产凭证、Token | Vault | mTLS | ❌ 永不出 Agent Pod |

### 4.2 模型数据脱敏

```typescript
// server/src/security/data-sanitizer.ts

/**
 * 发送到外部 API 前，对 prompt 和 tool results 做脱敏
 */
export function sanitizeForExternalAPI(content: string, projectLevel: string): string {
  if (projectLevel === 'public') return content

  let sanitized = content

  // 脱敏模式（按优先级）
  const patterns = [
    // API Keys / Tokens
    [/[A-Za-z0-9_-]{32,}/g, '[REDACTED_TOKEN]'],
    // AWS 凭证
    [/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]'],
    // 私钥
    [/-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END/, '[REDACTED_PRIVATE_KEY]'],
    // 内网 IP
    [/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[INTERNAL_IP]'],
    [/192\.168\.\d{1,3}\.\d{1,3}/g, '[INTERNAL_IP]'],
    // 数据库连接串
    [/\/\/[^:@]+:[^@]+@/g, '//[REDACTED]@'],
  ]

  for (const [pattern, replacement] of patterns) {
    sanitized = sanitized.replace(pattern, replacement)
  }

  return sanitized
}
```

### 4.3 Token 管理

```
                   ┌──────────────┐
                   │    Vault     │
                   │              │
                   │ - DB 密码    │
                   │ - API Keys   │
                   │ - TLS 证书   │
                   │ - SSH Keys   │
                   └──────┬───────┘
                          │ 动态注入
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Agent 1  │ │ Agent 2  │ │ Agent 3  │
        │ Pod      │ │ Pod      │ │ Pod      │
        │          │ │          │ │          │
        │ 临时 SA  │ │ 临时 SA  │ │ 临时 SA  │
        │ (session │ │ (session │ │ (session │
        │  scope)  │ │  scope)  │ │  scope)  │
        └──────────┘ └──────────┘ └──────────┘

Token 生命周期:
  1. Session 创建 → Vault 签发临时 Token（1h TTL）
  2. Agent 使用 Token → 仅访问授权资源
  3. Session 结束 → Token 立即吊销
  4. 异常检测 → Token 提前吊销 + 告警
```

---

## 5. 代码仓库安全

### 5.1 Git 操作安全

```typescript
// server/src/security/git-security.ts

export const GIT_SECURITY = {
  // 受保护的分支 — agent 不能直接 push
  protectedBranches: ['main', 'master', 'release/*', 'production'],

  // 强制所有 agent 修改在临时分支上
  requireTempBranch: true,

  // 分支命名: agent-{sessionId}-{timestamp}
  tempBranchPattern: /^agent-[a-f0-9]+-\d+$/,

  // PR 要求
  prRequired: true,         // 必须通过 PR 合并
  minApprovers: 1,          // 至少 1 人 approval
  requireCIPass: true,      // CI 必须通过

  // Commit 签名
  requireSignedCommits: true,
  agentGPGKey: 'agent@company.com', // agent 统一 GPG key

  // 禁止的操作
  blockedOperations: [
    'push --force',
    'push --delete',
    'reset --hard origin/',
    'commit --amend (已推送的 commit)',
  ],
}
```

---

## 6. 安全监控与响应

### 6.1 告警规则

```yaml
# alerts/prometheus-rules.yaml
groups:
  - name: agent_security
    rules:
      - alert: HighPermissionDenialRate
        expr: rate(tool_permission_denials[5m]) > 3
        annotations:
          summary: "High permission denial rate"

      - alert: SandboxAbnormalExit
        expr: sandbox_exit_code{code!="0"} > 0
        annotations:
          summary: "Sandbox exited abnormally"

      - alert: RestrictedProjectExternalAPICall
        expr: model_calls_total{project_level="restricted",provider="external"} > 0
        annotations:
          summary: "Restricted project data sent to external API!"

      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state{state="open"} > 0
        annotations:
          summary: "Circuit breaker opened — automatic recovery disabled"

      - alert: OffHoursRestrictedAccess
        expr: agent_sessions_active{project_level="restricted",hour=~"^(0[0-6]|2[0-3])$"} > 0
        annotations:
          summary: "Restricted project accessed outside business hours"
```

### 6.2 事件响应

```
安全事件检测
     │
     ▼
┌────────────┐
│ Level 1    │ 自动响应
│ 权限拒绝   │ → 通知用户
│ 频率异常   │ → 限流升级
└─────┬──────┘
      │ 升级
      ▼
┌────────────┐
│ Level 2    │ 安全值班响应
│ 沙箱异常   │ → 终止 session
│ 数据泄漏   │ → 吊销 Token
│ 检测       │ → 安全团队调查
└─────┬──────┘
      │ 升级
      ▼
┌────────────┐
│ Level 3    │ 全员响应
│ 逃逸检测   │ → 隔离集群
│ 大规模泄漏 │ → 暂停服务
│            │ → CISO 通知
└────────────┘
```

---

## 7. 合规检查清单

| 要求 | 实现 | 状态 |
|------|------|------|
| SOC2 — 访问控制 | RBAC + SSO + MFA | ✅ 设计完成 |
| SOC2 — 审计日志 | ClickHouse 不可变日志 | ✅ 设计完成 |
| SOC2 — 数据加密 | Encryption at rest + mTLS in transit | ✅ 设计完成 |
| ISO27001 — 风险评估 | 威胁模型 + 纵深防御 | ✅ 设计完成 |
| GDPR — 数据最小化 | 数据分级 + 脱敏 + 保留策略 | ⚠️ 需法务审查 |
| GDPR — 访问权 | 用户可导出自己的对话历史 | 🚧 待实现 |
| SOC2 — 变更管理 | GitOps (IaC) + PR review | ⚠️ 需流程定义 |
| SOC2 — 事件响应 | 3 级告警 + 响应流程 | ✅ 设计完成 |
