# 集成层设计

> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](./01-architecture-design.md)

---

## 2. 代码仓库集成（Git Service）

### 2.1 抽象层设计


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


### 3.2 Agent 视角的构建/部署流


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

MCP Server Registry 是内部工具的发现和调用中心。架构包含三个组件：Registry API（POST /mcp/register 注册新 server、GET /mcp/servers 列出可用服务、POST /mcp/:name/call 调用工具）、Server Catalog（PostgreSQL 存储 server 元数据——名称、描述、owner、team、transport 类型、endpoint、认证配置、可见性范围）、Health Checker（每 30s ping 所有已注册 server，连续 3 次失败标记 unhealthy，恢复后自动标记 healthy）。

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

VSCode 扩展架构采用 Webview + Extension Host 模式。Extension Host 侧负责：Sidebar Provider（Webview 渲染聊天面板）、Inline Completion Provider（Agent 建议代码补全）、Status Bar Indicator（Agent 运行状态）。通过 Cloud Client（WebSocket + HTTP）与云端通信——WebSocket 接收 SSE 流式响应，HTTP POST 发送用户消息和指令。关键交互：右键文件 → "Ask Claude" 引用文件到对话、Agent 编辑后 inline diff 对比、一键 Accept/Reject 修改。

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

CLI 客户端不运行 Agent Loop——所有执行在云端完成，CLI 仅负责：OAuth2 PKCE 认证（浏览器跳转完成 SSO 登录）、WebSocket 连接云端 Session、终端本地渲染流式 Markdown 输出。用户执行 cc "fix the auth bug" 时，CLI 将 prompt 和当前目录上下文发送到云端，云端执行 Agent Loop 并流式返回结果。CLI 通过 ~/.claude-cloud/config.yaml 配置 endpoint、认证方式、默认模型等。

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
