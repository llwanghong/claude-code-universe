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

## 3. 权限模型详细设计

> 📐 交互式权限流程图见页面底部。

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
