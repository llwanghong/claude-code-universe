# 安全架构设计

> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](./01-architecture-design.md)


:::diagram PermissionFlowDiagram:::
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

---

## 2. 纵深防御架构 (Defense in Depth)

### 2.1 为什么需要 6 层

安全领域有一条铁律：**没有任何单一防御层是完美的**。防火墙可能被绕过，JWT 可能被窃取，容器可能被逃逸。纵深防御的核心思想是：即使某一层被突破，下一层仍然提供保护。我们从 Claude Code 源码研究（ch06 权限系统、ch16 Sandbox）中借鉴了成熟模式，扩展到企业环境。

### 2.2 6 层防线详解

:::diagram SecurityLayersDiagram:::

| 层 | 名称 | 核心策略 |
|----|------|---------|
| L1 | **Network** | K8s NetworkPolicy（仅 API Gateway 暴露 Ingress）、Egress 白名单（每项目级别）、mTLS（Pod 间双向 TLS）、Agent Pod 默认无 Egress |
| L2 | **Authentication** | SSO/OIDC + MFA、JWT（access 15min + refresh 8h）、Service Account（mTLS + Token Review）、API Key（CI/CD 场景，可撤销） |
| L3 | **Authorization** | RBAC 四角色 + Project ACL、Tool Permission（ch06 7 种模式 + 6 步决策链）、高风险操作审批流、环境闸门（staging / production） |
| L4 | **Isolation** | 独立 Pod（非共享进程）、gVisor (runsc) 用户态内核、CoW overlay workspace、Seccomp（禁用 ptrace/mount/kexec/init_module/delete_module） |
| L5 | **Data** | Vault 密钥管理（Token 动态注入不落盘）、Encryption at rest + in transit、PII 脱敏（外部 API 发送前）、每 Session 独立临时 Token（TTL ≤ 24h） |
| L6 | **Audit** | ClickHouse 不可变审计日志、实时告警（权限异常 / 沙箱逃逸 / 非工时 restricted 访问 / Circuit Breaker）、Anomaly Detection、合规导出 |

### 2.3 防线联动

各层之间通过 shared context 联动。示例攻击链：

```
攻击: 恶意代码仓库注入 prompt 诱导危险命令

Layer 1 (Network): Egress 白名单阻止 curl 外部 URL → ✅ 拦截
  如果被绕过...
Layer 3 (Authorization): Bash(curl) 需要确认 → ✅ 弹窗警告
  如果用户误点 Allow...
Layer 4 (Isolation): gVisor 阻止 connect() 到非白名单 IP → ✅ 拦截
  如果沙箱配置失误...
Layer 5 (Data): Token 不在沙箱环境变量里，Vault 不响应该请求 → ✅ 拦截
  如果 Token 硬编码在代码里...
Layer 6 (Audit): 操作被完整记录，告警触发安全团队响应 → ✅ 事后处置
```

每个 Agent 请求经过全部 6 层。每层独立做决策，不需要信任上一层的判断。

---

## 3. 权限模型详细设计

### 3.1 权限决策流程

权限决策链包含 6 个步骤，按优先级依次执行。步骤 1 (Hook Decision)：PreToolUse Hook 最先运行，可以 allow / deny / modify-input / inject-context，来源包括平台策略、团队配置和项目配置。步骤 2 (Rule Matching)：三层规则按平台级 > 团队级 > 项目级优先级匹配，alwaysDeny 直接阻止（如 Bash(rm -rf *)），alwaysAllow 直接放行（如 Bash(git *)）。步骤 3 (Tool-Specific Check)：工具的 checkPermissions() 方法——DBTool 检查是否 SELECT 语句，DeployTool 检查目标环境。步骤 4 (Mode Default)：7 种权限模式的默认行为。步骤 5 (Interactive Prompt)：Web/IDE/CLI 三种形态的权限对话框。步骤 6 (Approval Flow)：高风险操作自动创建 Jira/飞书审批 ticket。

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
