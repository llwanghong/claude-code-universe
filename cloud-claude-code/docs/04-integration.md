# 集成层设计

> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](./01-architecture-design.md)

## 1. 集成架构总览

```
┌──────────────────────────────────────────────────────────┐
│                    Integration Plane                      │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │   Git    │  │   CI/CD  │  │   MCP Registry       │   │
│  │ Service  │  │ Service  │  │                       │   │
│  │          │  │          │  │  mysql-mcp  redis-mcp │   │
│  │ GitLab   │  │ Jenkins  │  │  k8s-mcp    jira-mcp  │   │
│  │ Bitbucket│  │ GitLab CI│  │  sentry-mcp grafana-  │   │
│  │ GitHub   │  │          │  │  mcp         custom-* │   │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘   │
│       │             │                   │                │
│       └─────────────┼───────────────────┘                │
│                     │                                    │
│            ┌────────▼────────┐                          │
│            │  Agent Runtime  │                          │
│            │  (Tool Pipeline)│                          │
│            └─────────────────┘                          │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 代码仓库集成（Git Service）

### 2.1 抽象层设计

```typescript
// server/src/integration/git/types.ts

export interface GitService {
  // ── 仓库操作 ──
  clone(url: string, options: CloneOptions): Promise<Workspace>
  fetch(workspace: Workspace): Promise<FetchResult>
  checkout(workspace: Workspace, ref: string): Promise<void>

  // ── 分支操作 ──
  createBranch(workspace: Workspace, name: string, base?: string): Promise<void>
  deleteBranch(workspace: Workspace, name: string): Promise<void>
  listBranches(workspace: Workspace): Promise<Branch[]>

  // ── 变更操作 ──
  status(workspace: Workspace): Promise<GitStatus>
  diff(workspace: Workspace, options?: DiffOptions): Promise<DiffResult>
  add(workspace: Workspace, paths: string[]): Promise<void>
  commit(workspace: Workspace, message: string): Promise<Commit>
  push(workspace: Workspace, remote?: string): Promise<void>

  // ── PR/MR 操作 ──
  createPR(workspace: Workspace, params: PRParams): Promise<PullRequest>
  getPR(id: string): Promise<PullRequest>
  listPRs(filter: PRFilter): Promise<PullRequest[]>
  addPRComment(prId: string, comment: string): Promise<void>
  mergePR(prId: string, method?: 'merge' | 'squash' | 'rebase'): Promise<void>

  // ── 搜索 ──
  searchCode(query: string, options?: SearchOptions): Promise<SearchResult[]>
  getFileHistory(path: string): Promise<FileHistory>

  // ── Webhook ──
  registerWebhook(project: string, events: WebhookEvent[]): Promise<Webhook>
  handleWebhook(payload: unknown): Promise<WebhookEvent>
}

export interface CloneOptions {
  ref?: string              // 分支/tag/commit
  depth?: number            // shallow clone depth
  shared?: boolean          // 使用 --shared（从 bare cache）
  sparse?: string[]         // sparse checkout 路径
}

export interface PRParams {
  title: string
  body: string
  sourceBranch: string
  targetBranch: string
  reviewers?: string[]
  labels?: string[]
  draft?: boolean
}
```

### 2.2 多平台适配

```typescript
// server/src/integration/git/gitlab-service.ts
export class GitLabService implements GitService {
  constructor(
    private api: GitLabAPI,
    private config: GitLabConfig
  ) {}

  async createPR(ws: Workspace, params: PRParams): Promise<PullRequest> {
    const mr = await this.api.createMergeRequest(ws.projectId, {
      source_branch: params.sourceBranch,
      target_branch: params.targetBranch,
      title: params.title,
      description: params.body,
      reviewer_ids: await this.resolveReviewers(params.reviewers),
      labels: params.labels?.join(','),
    })
    return this.adaptMR(mr)
  }
}

// server/src/integration/git/bitbucket-service.ts
export class BitbucketService implements GitService {
  constructor(
    private api: BitbucketAPI,
    private config: BitbucketConfig
  ) {}

  async createPR(ws: Workspace, params: PRParams): Promise<PullRequest> {
    const pr = await this.api.createPullRequest(ws.repoSlug, {
      title: params.title,
      description: params.body,
      source: { branch: { name: params.sourceBranch } },
      destination: { branch: { name: params.targetBranch } },
      reviewers: params.reviewers?.map(r => ({ uuid: r })),
    })
    return this.adaptPR(pr)
  }
}
```

### 2.3 Agent 视角的 Git 操作流

```
Agent: "I'll fix the auth bug"

  1. git checkout -b agent-fix-auth-{uuid}
  2. Read/Edit files in /workspace/src/auth/
  3. git add src/auth/login.ts src/auth/validate.ts
  4. git commit -m "fix: add null check for userId in auth flow"
  5. git push origin agent-fix-auth-{uuid}
  6. Create PR (via GitLab/Bitbucket API):
     - Title: "fix: add null check for userId in auth flow"
     - Body: auto-generated summary of changes
     - Reviewers: [team-lead]
     - Labels: [ai-generated, needs-review]
  7. Agent reports: "Created PR #1234 — waiting for review"
```

---

## 3. CI/CD 集成（Build Service）

### 3.1 抽象层

```typescript
// server/src/integration/cicd/types.ts

export interface BuildService {
  // ── 构建操作 ──
  triggerBuild(params: BuildParams): Promise<Build>
  getBuild(buildId: string): Promise<Build>
  getBuildLog(buildId: string): AsyncGenerator<string>
  cancelBuild(buildId: string): Promise<void>
  listBuilds(filter: BuildFilter): Promise<Build[]>

  // ── 部署操作 ──
  triggerDeploy(params: DeployParams): Promise<Deployment>
  getDeploy(deployId: string): Promise<Deployment>
  getDeployLog(deployId: string): AsyncGenerator<string>
  rollbackDeploy(env: string, version: string): Promise<Deployment>
  listDeployments(env: string): Promise<Deployment[]>

  // ── 环境操作 ──
  getEnvironment(env: string): Promise<Environment>
  listEnvironments(): Promise<Environment[]>
  getEnvironmentVariables(env: string): Promise<Record<string, string>>
}

export interface DeployParams {
  environment: 'staging' | 'canary' | 'production'
  version: string
  artifact?: string           // Docker image tag, etc.
  dryRun?: boolean
  requireApproval?: boolean
}

export interface BuildParams {
  project: string
  branch: string
  commit: string
  triggeredBy: 'agent' | 'manual' | 'webhook'
  variables?: Record<string, string>
}
```

### 3.2 Agent 视角的构建/部署流

```
Agent: "The changes look good. Let me verify and deploy."

  Build:
  1. Agent triggers: BuildTool({ project: 'myapp', branch: 'agent-fix-auth' })
  2. Build starts — agent streams build log in real-time
  3. Build passes ✅ — agent reports: "Build successful (2m 34s)"

  Deploy (staging):
  4. Agent triggers: DeployTool({ env: 'staging', version: 'abc123' })
  5. Deploy starts — agent monitors deploy log
  6. Deploy succeeds ✅ — agent reports: "Deployed to staging"

  Deploy (production):
  7. Agent triggers: DeployTool({ env: 'production', version: 'abc123' })
  8. ┌─ Approval Required ─────────────────────────┐
     │ "Agent wants to deploy to production"        │
     │ Version: abc123                              │
     │ Changes: fix null check in auth flow         │
     │ [Approve] [Reject]                           │
     └──────────────────────────────────────────────┘
  9. Team Lead approves → deploy proceeds
```

### 3.3 部署安全策略

```yaml
# .claude/deploy-policies.yaml
environments:
  staging:
    autoApprove: true          # Agent 可以直接部署
    maxDeployPerHour: 10
    requiredChecks: []         # 不需要额外检查

  canary:
    autoApprove: false         # 需要 TL 审批
    maxDeployPerHour: 5
    requiredChecks:
      - build_passed
      - unit_tests_passed
      - lint_passed

  production:
    autoApprove: false         # 需要审批
    maxDeployPerHour: 2
    requiredChecks:
      - build_passed
      - all_tests_passed
      - security_scan_passed
      - canary_validated       # 必须先通过 canary
    requiredApprovers: 2       # 需要 2 人审批
    deployWindow:               # 仅工作时间可部署
      days: [Mon, Tue, Wed, Thu, Fri]
      hours: "09:00-17:00"
```

---

## 4. MCP 内部工具注册中心

### 4.1 架构

```
┌─────────────────────────────────────────────────────┐
│            MCP Server Registry                       │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Registry API                                 │   │
│  │  POST   /mcp/register    — 注册新 server      │   │
│  │  DELETE /mcp/:name       — 注销 server        │   │
│  │  GET    /mcp/servers     — 列出可用 servers   │   │
│  │  GET    /mcp/:name/tools — 列出 server 工具   │   │
│  │  POST   /mcp/:name/call  — 调用工具           │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Server Catalog (PostgreSQL)                  │   │
│  │  - name, description, owner, team             │   │
│  │  - transport type, endpoint, auth config      │   │
│  │  - visibility (global / team / project)       │   │
│  │  - health status, last check timestamp        │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Health Checker                                │   │
│  │  - 每 30s ping 所有注册的 servers             │   │
│  │  - 连续 3 次失败 → 标记 unhealthy             │   │
│  │  - 恢复后自动标记 healthy                     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 4.2 MCP Server 定义

```typescript
// 注册一个内部 MCP server
const jiraMcp: MCPServerDefinition = {
  name: 'jira-mcp',
  description: 'Jira ticket management — create, search, update tickets',
  owner: 'platform-team',
  team: 'platform',
  visibility: 'global',         // 所有团队可见
  transport: {
    type: 'http',
    endpoint: 'https://jira-mcp.internal.company.com',
    auth: {
      type: 'oauth',
      oauthConfig: {
        clientId: 'claude-code-agent',
        authServerUrl: 'https://auth.company.com/oauth',
      }
    }
  },
  tools: [
    {
      name: 'search_tickets',
      description: 'Search Jira tickets by query',
      inputSchema: z.object({
        query: z.string(),
        project: z.string().optional(),
        limit: z.number().default(20),
      }),
    },
    {
      name: 'create_ticket',
      description: 'Create a new Jira ticket',
      inputSchema: z.object({
        project: z.string(),
        type: z.enum(['bug', 'task', 'story']),
        title: z.string(),
        description: z.string(),
        assignee: z.string().optional(),
      }),
    },
  ],
  rateLimit: {
    maxRequestsPerMinute: 60,
    maxConcurrent: 5,
  }
}
```

### 4.3 工具可见性矩阵

```
                     Global    Team A   Team B   Project X
  ──────────────────────────────────────────────────────
  jira-mcp             ✅        ✅       ✅       ✅
  confluence-mcp       ✅        ✅       ✅       ✅
  mysql-mcp (prod)     ❌        ✅       ❌       ❌
  redis-mcp (cache)    ❌        ✅       ✅       ❌
  k8s-mcp              ❌        ✅       ❌       ❌
  sentry-mcp           ✅        ✅       ✅       ✅
  grafana-mcp          ✅        ✅       ✅       ❌
  custom-slack-bot     ❌        ❌       ✅       ❌
```

---

## 5. 消息通知集成

### 5.1 通知渠道

```typescript
// server/src/integration/notifications/types.ts

export interface NotificationService {
  send(channel: NotificationChannel, message: Notification): Promise<void>
  sendApproval(approval: ApprovalRequest): Promise<void>
  sendAlert(alert: SecurityAlert): Promise<void>
}

export type NotificationChannel =
  | { type: 'slack'; channel: string }     // Slack 频道
  | { type: 'feishu'; chatId: string }     // 飞书群
  | { type: 'email'; to: string[] }        // 邮件
  | { type: 'jira'; project: string }      // Jira comment
  | { type: 'webhook'; url: string }       // 自定义 Webhook

// 示例：审批通知
const approvalNotification: Notification = {
  title: '🔐 部署审批请求',
  body: `Agent 请求部署到 **production**
**变更**: fix null check in auth flow
**PR**: #1234
**构建**: ✅ passed
**测试**: ✅ passed`,
  actions: [
    { label: 'Approve', style: 'primary', action: 'approve' },
    { label: 'Reject', style: 'danger', action: 'reject' },
    { label: 'View Details', url: 'https://claude.company.com/approvals/xxx' },
  ]
}
```

---

## 6. IDE Extension 集成

### 6.1 VSCode Extension

```
┌──────────────────────────────────────────────────────┐
│  VSCode Extension Architecture                        │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  Extension Host                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │ Sidebar  │  │ Inline   │  │ Status Bar   │  │  │
│  │  │ Provider │  │ Completion│  │ Indicator    │  │  │
│  │  │ (Webview)│  │ Provider │  │              │  │  │
│  │  └──────────┘  └──────────┘  └──────────────┘  │  │
│  │  ┌──────────────────────────────────────────┐   │  │
│  │  │  Cloud Client (WebSocket + HTTP)         │   │  │
│  │  │  - auth: OAuth2 PKCE                     │   │  │
│  │  │  - stream: SSE events                    │   │  │
│  │  │  - commands: HTTP POST                   │   │  │
│  │  └──────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────┘  │
│                           │                           │
│                    Cloud API                          │
└──────────────────────────────────────────────────────┘

功能：
  - 侧边栏 Chat 面板（替代终端）
  - 内联代码补全（agent 建议代码修改）
  - Diff 对比（agent 修改 vs 当前代码）
  - @file 引用（右键文件 → "Ask Claude"）
  - 状态栏指示器（agent 是否在运行）
```

### 6.2 关键 API

```typescript
// VSCode Extension API 适配
export class VSCodeCloudClient {
  private ws: WebSocket
  private sessionId: string

  // 发送消息
  async sendMessage(prompt: string, context?: VSCodeContext): Promise<void> {
    this.ws.send(JSON.stringify({
      type: 'user_message',
      sessionId: this.sessionId,
      prompt,
      context: {
        activeFile: context?.activeFile,
        selection: context?.selection,
        visibleFiles: context?.visibleFiles,
      }
    }))
  }

  // 接收流式响应
  onStreamEvent(callback: (event: StreamEvent) => void): void {
    this.ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data)
      if (parsed.sessionId === this.sessionId) {
        callback(parsed)
      }
    }
  }

  // 获取文件差异
  async getDiff(filePath: string): Promise<DiffResult> {
    return fetch(`/api/sessions/${this.sessionId}/diff?path=${filePath}`)
  }

  // 接受/拒绝修改
  async acceptChanges(filePath: string): Promise<void> {
    return fetch(`/api/sessions/${this.sessionId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath })
    })
  }
}
```

---

## 7. CLI Client 集成

### 7.1 Thin Client 设计

```
┌──────────────────────────────────────┐
│          CLI Client (本地)            │
│                                       │
│  $ cc "fix the auth bug"             │
│       │                               │
│       ▼                               │
│  ┌──────────┐                        │
│  │ Auth     │ → OAuth2 PKCE 浏览器   │
│  └──────────┘                        │
│       │                               │
│       ▼                               │
│  ┌──────────┐                        │
│  │ WebSocket│ → 云端 session         │
│  │ Client   │ ← 流式响应              │
│  └──────────┘                        │
│       │                               │
│       ▼                               │
│  ┌──────────┐                        │
│  │ Terminal │ → 本地终端渲染          │
│  │ Output   │   流式 markdown         │
│  └──────────┘                        │
└──────────────────────────────────────┘

CLI 不运行 agent loop — 只是转发请求和渲染输出。
所有执行都在云端。
```

### 7.2 配置

```yaml
# ~/.claude-cloud/config.yaml
endpoint: https://claude.company.com
auth:
  method: oauth    # oauth | apikey
team: platform
default_model: inherit
editor: vim       # 用于外部编辑器
```

---

## 8. 集成测试策略

```typescript
// server/src/integration/__tests__/git-service.test.ts

describe('GitLabService', () => {
  it('should create branch, commit, push, and create MR', async () => {
    const git = new GitLabService(mockApi, testConfig)
    const ws = await git.clone(testRepoUrl)

    await git.createBranch(ws, 'agent-test-branch')
    await git.commit(ws, 'test: add unit test')
    await git.push(ws)

    const pr = await git.createPR(ws, {
      title: 'test: add unit test',
      body: 'auto-generated',
      sourceBranch: 'agent-test-branch',
      targetBranch: 'main',
    })

    expect(pr.title).toBe('test: add unit test')
  })
})

describe('BuildService', () => {
  it('should trigger build and stream log', async () => {
    const build = new JenkinsService(mockApi, testConfig)
    const result = await build.triggerBuild({
      project: 'myapp',
      branch: 'agent-test',
      commit: 'abc123',
      triggeredBy: 'agent',
    })

    expect(result.status).toBe('running')

    const logs: string[] = []
    for await (const line of build.getBuildLog(result.id)) {
      logs.push(line)
    }

    expect(logs).toContain('BUILD SUCCESS')
  })
})
```
