# Web UI 设计

> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](./01-architecture-design.md)

## 1. 设计目标

- **类 IDE 体验**：文件树 + 代码 Diff + 终端输出，开发者不离开浏览器
- **流式响应**：token 实时流式渲染，不等完整响应
- **多会话**：Tab 切换，同时处理多个项目/任务
- **权限可视化**：危险操作清晰标注，审批状态可追踪

## 3. 组件树

```
<App>
  <AuthProvider>                          // 认证状态
    <ProjectProvider>                     // 当前项目上下文
      <Layout>
        <Header>
          <SidebarToggle />
          <ProjectSelector />             // 切换项目
          <SessionTabs />                 // 会话标签页
          <SettingsMenu />
          <UserMenu />
        </Header>

        <Sidebar>
          <FileTreePanel />               // 仓库文件浏览
          <AgentStatusPanel />            // 子 agent 状态
          <MemoryPanel />                 // 项目记忆
        </Sidebar>

        <MainContent>
          <SessionProvider>
            <ConversationView>
              <MessageList>               // 虚拟滚动消息列表
                <MessageRow>              // 单条消息
                  <UserMessage />
                  <AssistantMessage>
                    <StreamingMarkdown /> // 流式渲染 markdown
                    <CodeBlock />         // 语法高亮代码
                    <DiffView />          // side-by-side diff
                  </AssistantMessage>
                  <ToolResult>
                    <TerminalOutput />    // Shell 输出
                    <FilePreview />       // 文件内容预览
                    <BuildLog />          // 构建日志
                  </ToolResult>
                  <SystemMessage />
                </MessageRow>
              </MessageList>

              <PermissionDialog />        // 权限确认弹窗
              <ApprovalCard />            // 审批卡片
            </ConversationView>

            <PromptInput>
              <MentionAutocomplete />     // @file @agent
              <CommandPalette />          // / 命令面板
              <AttachButton />
              <SendButton />
            </PromptInput>
          </SessionProvider>
        </MainContent>
      </Layout>
    </ProjectProvider>
  </AuthProvider>
</App>
```

## 4. 核心交互流

### 4.1 发送消息 → 流式响应

```
1. 用户在 PromptInput 中输入 "fix the auth bug @src/auth/login.ts"
2. 点击 Send / Ctrl+Enter
3. PromptInput 显示用户消息
4. SSE 连接建立 → 流式接收 token
5. StreamingMarkdown 组件实时渲染
6. 检测到 tool_use block → 显示工具状态 spinner
7. 工具完成 → 显示 ToolResult
8. 循环直到 Terminal state
```

### 4.2 权限确认

用户发送消息后，Agent 执行到需要权限的工具调用时，前端收到 permission_request SSE 事件并弹出 PermissionDialog。对话框展示：工具名称、具体命令、风险评估（高/中/低）。用户可选择 Allow Once（本次放行）/ Always Allow + 规则模式（如 Bash(git *) 永久放行）/ Deny（拒绝）。选择后发送 permission_response，Agent 继续或跳过该工具。规则持久化到项目 .claude/rules.yaml，后续自动匹配。

## 5. 技术选型

| 层 | 技术 | 理由 |
|----|------|------|
| 框架 | Astro 5 + React 19 | 静态站点 + 交互组件，和现有 web-zh 一致 |
| 样式 | Tailwind CSS v4 | 快速原型 + 设计系统 |
| 流式 | EventSource (SSE) | 浏览器原生，自动重连 |
| 代码编辑 | Monaco Editor | VSCode 同款，diff/syntax highlight |
| Markdown | marked + highlight.js | 服务端/客户端双重渲染 |
| 文件树 | 自定义 React 组件 | 虚拟滚动 + 懒加载子树 |
| 状态管理 | React Context + useReducer | 轻量，无额外依赖 |
| 虚拟滚动 | @tanstack/react-virtual | 高性能消息列表 |

## 6. 关键组件实现

### 6.1 StreamingMarkdown

```tsx
// web/src/components/ChatView/StreamingMarkdown.tsx

export function StreamingMarkdown({ content, isStreaming }: Props) {
  const tokens = useMarkdownTokens(content)

  return (
    <div className="prose dark:prose-invert max-w-none">
      {tokens.map((token, i) => {
        // 代码块: 语法高亮
        if (token.type === 'code') {
          return <CodeBlock key={i} language={token.lang} code={token.text} />
        }
        // Diff: 特殊渲染
        if (token.type === 'code' && token.lang === 'diff') {
          return <DiffView key={i} diff={token.text} />
        }
        // 内联代码
        if (token.type === 'codespan') {
          return <code key={i} className="inline-code">{token.text}</code>
        }
        // 普通文本: 流式光标
        return <span key={i}>{token.text}</span>
      })}
      {isStreaming && <span className="streaming-cursor">▊</span>}
    </div>
  )
}
```

### 6.2 FileTree

```tsx
// web/src/components/FileTree/FileTree.tsx

export function FileTree({ workspace, onFileClick }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src']))
  const tree = useFileTree(workspace)

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <SearchInput placeholder="Filter files..." />
        <button onClick={() => setExpanded(new Set())}>Collapse All</button>
      </div>
      <FileTreeNode
        node={tree.root}
        expanded={expanded}
        onToggle={(path) => {
          setExpanded(prev => {
            const next = new Set(prev)
            next.has(path) ? next.delete(path) : next.add(path)
            return next
          })
        }}
        onClick={onFileClick}
      />
    </div>
  )
}

function FileTreeNode({ node, expanded, onToggle, onClick, depth = 0 }: NodeProps) {
  if (node.type === 'directory') {
    const isExpanded = expanded.has(node.path)
    return (
      <div>
        <div
          className="file-tree-item directory"
          style={{ paddingLeft: depth * 16 }}
          onClick={() => onToggle(node.path)}
        >
          <span className="toggle">{isExpanded ? '▾' : '▸'}</span>
          <FolderIcon />
          <span>{node.name}</span>
        </div>
        {isExpanded && node.children.map(child => (
          <FileTreeNode key={child.path} node={child} {...{ expanded, onToggle, onClick, depth: depth + 1 }} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="file-tree-item file"
      style={{ paddingLeft: depth * 16 + 20 }}
      onClick={() => onClick(node.path)}
    >
      <FileIcon filename={node.name} />
      <span>{node.name}</span>
    </div>
  )
}
```

### 6.3 PermissionDialog

```tsx
// web/src/components/PermissionDialog/PermissionDialog.tsx

export function PermissionDialog({ request, onDecision }: Props) {
  const [alwaysRule, setAlwaysRule] = useState<string>('')

  return (
    <div className="permission-overlay">
      <div className="permission-dialog">
        <div className="permission-icon">🔐</div>
        <h3>Permission Required</h3>

        <div className="permission-details">
          <div className="detail-row">
            <span className="label">Tool:</span>
            <code>{request.toolName}</code>
          </div>
          <div className="detail-row">
            <span className="label">Action:</span>
            <code className="command">{request.description}</code>
          </div>
          {request.risk === 'high' && (
            <div className="risk-warning">⚠️ High risk operation</div>
          )}
        </div>

        <div className="always-rule">
          <label>
            <input
              type="checkbox"
              checked={!!alwaysRule}
              onChange={(e) => setAlwaysRule(
                e.target.checked ? `${request.toolName}(${request.pattern || '*'})` : ''
              )}
            />
            Always allow: <code>{alwaysRule || '...'}</code>
          </label>
        </div>

        <div className="permission-actions">
          <button className="btn-allow" onClick={() => onDecision('allow', alwaysRule)}>
            Allow Once
          </button>
          {alwaysRule && (
            <button className="btn-allow-always" onClick={() => onDecision('always_allow', alwaysRule)}>
              Always Allow
            </button>
          )}
          <button className="btn-deny" onClick={() => onDecision('deny')}>
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}
```

## 7. 状态管理

```typescript
// web/src/state/session-store.ts

type SessionState = {
  // 会话
  sessions: Map<string, Session>
  activeSessionId: string | null

  // 消息
  messages: Map<string, Message[]>
  streamingContent: Map<string, string>  // sessionId → 当前流式内容

  // 工具
  activeTools: Map<string, ToolExecution> // toolUseId → 执行状态
  pendingPermissions: PermissionRequest[]

  // UI
  sidebarCollapsed: boolean
  activePanel: 'files' | 'agents' | 'memory'
}

type SessionAction =
  | { type: 'CREATE_SESSION'; projectId: string }
  | { type: 'SWITCH_SESSION'; sessionId: string }
  | { type: 'APPEND_STREAMING_TOKEN'; sessionId: string; token: string }
  | { type: 'ADD_MESSAGE'; sessionId: string; message: Message }
  | { type: 'START_TOOL'; toolUseId: string; toolName: string }
  | { type: 'COMPLETE_TOOL'; toolUseId: string; result: ToolResult }
  | { type: 'SHOW_PERMISSION'; request: PermissionRequest }
  | { type: 'RESOLVE_PERMISSION'; decision: PermissionDecision }

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'APPEND_STREAMING_TOKEN': {
      const key = action.sessionId
      const current = state.streamingContent.get(key) || ''
      return {
        ...state,
        streamingContent: new Map(state.streamingContent).set(key, current + action.token)
      }
    }
    // ... 其他 cases
  }
}
```

## 8. SSE 流式客户端

```typescript
// web/src/lib/cloud-client.ts

export class CloudClient {
  private eventSource: EventSource | null = null

  async connect(sessionId: string): Promise<void> {
    this.eventSource = new EventSource(
      `${API_BASE}/sessions/${sessionId}/stream`,
      { withCredentials: true }
    )

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'token':
          store.dispatch({ type: 'APPEND_STREAMING_TOKEN', sessionId, token: data.content })
          break

        case 'message':
          store.dispatch({ type: 'ADD_MESSAGE', sessionId, message: data.message })
          break

        case 'tool_start':
          store.dispatch({ type: 'START_TOOL', toolUseId: data.id, toolName: data.name })
          break

        case 'tool_result':
          store.dispatch({ type: 'COMPLETE_TOOL', toolUseId: data.id, result: data.result })
          break

        case 'permission_request':
          store.dispatch({ type: 'SHOW_PERMISSION', request: data })
          break

        case 'approval_pending':
          store.dispatch({ type: 'SHOW_APPROVAL', request: data })
          break

        case 'terminal':
          store.dispatch({ type: 'COMPLETE_SESSION', sessionId, reason: data.reason })
          this.disconnect()
          break
      }
    }

    this.eventSource.onerror = () => {
      // SSE 自动重连，不需要额外处理
      console.warn('SSE connection lost, reconnecting...')
    }
  }

  async sendMessage(prompt: string, context?: PromptContext): Promise<void> {
    await fetch(`${API_BASE}/sessions/${this.sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context }),
    })
  }

  disconnect(): void {
    this.eventSource?.close()
    this.eventSource = null
  }
}
```

---

## 10. 未来规划

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 深色/浅色主题 | P0 | 跟随系统或手动切换 |
| Monaco Diff Editor | P0 | 替代纯文本 diff |
| 多会话 Tabs | P0 | 拖拽排序、关闭确认 |
| Command Palette (⌘K) | P1 | 快速切换项目/会话/设置 |
| 快捷键系统 (ch14 模式) | P1 | 16 上下文，用户可自定义 |
| @file 自动补全 | P1 | fuzzy search + 最近文件 |
| 图片粘贴 (拖拽) | P2 | 多模态支持 |
| Vim 模式输入 | P2 | 继承 ch14 vim 状态机 |
| 语音输入 | P3 | 浏览器 Web Speech API |
| Collaborative Session | P3 | 多人加入同一会话 |
