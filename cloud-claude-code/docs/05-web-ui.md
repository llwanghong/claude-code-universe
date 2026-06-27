> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](../01-architecture-design/)

## 1. 设计目标

- **类 IDE 体验**：文件树 + 代码 Diff + 终端输出，开发者不离开浏览器
- **流式响应**：token 实时流式渲染，不等完整响应
- **多会话**：Tab 切换，同时处理多个项目/任务
- **权限可视化**：危险操作清晰标注，审批状态可追踪

## 2. 页面布局与架构

### 2.1 整体布局

Web 应用采用经典的三栏式 IDE 布局，但针对 AI 对话场景做了优化：

**顶部 Header Bar**：侧栏切换按钮、项目选择器（下拉切换仓库）、会话 Tabs（多 Tab 并行，可拖拽排序）、设置菜单、用户菜单

**左侧 Sidebar**（260px，桌面端默认展开；笔记本端默认折叠；移动端抽屉式覆盖）：
- **FileTree Panel**：仓库文件浏览，支持搜索过滤、点击 @mention 引用文件到对话
- **AgentStatus Panel**：子 Agent 运行状态（运行中 / 已完成 / 错误）
- **Memory Panel**：项目记忆条目列表（编码风格、已知坑、架构约束）

**中间 Main Conversation**（自适应宽度）：
- **MessageList**：虚拟滚动消息列表，每条消息可包含流式 Markdown、语法高亮代码块、Diff 视图、工具结果（终端输出 / 文件预览 / 构建日志）
- **PermissionDialog**：权限确认弹窗（工具名 + 具体命令 + 风险等级 + Allow Once / Always Allow / Deny）
- **PromptInput**：底部输入栏，支持 @file 自动补全、/ 命令面板、附件上传

**右侧 Right Panel**（280px，可选，默认隐藏）：Agent 状态详情、Memory 条目、工具执行历史

### 2.2 响应式设计

三种断点适配不同场景：

| 断点 | 宽度 | Sidebar | 对话 | Right Panel |
|------|------|---------|------|-------------|
| Desktop | ≥1280px | 固定 260px | 自适应 | 可选 280px |
| Laptop | 768-1279px | 可折叠，默认折叠 | 自适应 | 隐藏 |
| Mobile | <768px | 抽屉式覆盖 | 全宽 | 隐藏 |

### 2.3 深色/浅色主题

基于 CSS 变量实现双主题，跟随系统 `prefers-color-scheme`，可在设置中手动切换：

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fa;
  --bg-tertiary: #e1e4e8;
  --text-primary: #1a1a2e;
  --text-secondary: #586069;
  --border: #e1e4e8;
  --accent: #0969da;
  --danger: #cf222e;
  --success: #1a7f37;
}

[data-theme="dark"] {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --border: #30363d;
  --accent: #58a6ff;
  --danger: #f85149;
  --success: #3fb950;
}
```

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

## 9. 性能优化策略

### 9.1 虚拟滚动

对话历史可能包含数百条消息（每条约 50-500 tokens 渲染为 Markdown + 代码块）。全量渲染会卡顿，必须使用虚拟滚动仅渲染可视区域：

```typescript
// web/src/components/ChatView/MessageList.tsx

import { useVirtualizer } from '@tanstack/react-virtual';

export function MessageList({ messages, streamingContent }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // 根据消息内容估算高度
      const msg = messages[index]
      if (msg.type === 'tool_result') return 200
      if (msg.content?.includes('```')) return 350
      return 80 + Math.ceil(msg.content?.length || 0 / 80) * 20
    },
    overscan: 5,  // 预渲染可视区外 5 条
  })

  return (
    <div ref={parentRef} className="message-list" style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <MessageRow message={messages[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 9.2 代码块懒加载

代码块超过 200 行时，默认只渲染前 50 行 + "Show All" 按钮，点击后完整渲染。Syntax highlighting 使用 Web Worker 异步处理，避免阻塞主线程：

```typescript
// web/src/components/ChatView/CodeBlock.tsx

export function CodeBlock({ language, code }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const workerRef = useRef<Worker>()

  const lines = code.split('\n')
  const isLong = lines.length > 200
  const displayCode = isLong && !expanded
    ? lines.slice(0, 50).join('\n') + '\n// ... (truncated)'
    : code

  useEffect(() => {
    // 异步语法高亮，不阻塞主线程
    workerRef.current = new Worker(
      new URL('../workers/highlight.worker.ts', import.meta.url)
    )
    workerRef.current.onmessage = (e) => setHighlighted(e.data)
    workerRef.current.postMessage({ language, code: displayCode })

    return () => workerRef.current?.terminate()
  }, [language, displayCode])

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language}</span>
        <button onClick={() => navigator.clipboard.writeText(code)}>
          📋 Copy
        </button>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlighted || escapeHtml(displayCode) }} />
      </pre>
      {isLong && (
        <button className="show-all" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show Less' : `Show All ${lines.length} Lines`}
        </button>
      )}
    </div>
  )
}
```

### 9.3 流式渲染优化

SSE 推送 token 速率可达 50-100 tokens/s。每次 token 都触发 React re-render 会导致性能问题。使用 `requestAnimationFrame` 批量更新：

```typescript
// web/src/lib/stream-buffer.ts

export class StreamBuffer {
  private buffer: string[] = []
  private rafId: number | null = null
  private callback: (text: string) => void

  constructor(callback: (text: string) => void) {
    this.callback = callback
  }

  push(token: string): void {
    this.buffer.push(token)
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.flush()
      })
    }
  }

  private flush(): void {
    const text = this.buffer.join('')
    this.buffer = []
    this.rafId = null
    this.callback(text)
  }
}
```

### 9.4 Monaco Editor 按需加载

Diff 视图使用 Monaco Editor 仅在需要时动态导入：

```typescript
// web/src/components/Diff/DiffView.tsx

const MonacoDiff = lazy(() => import('./MonacoDiff'))

export function DiffView({ original, modified, filePath }: Props) {
  return (
    <Suspense fallback={<UnifiedDiff original={original} modified={modified} />}>
      <MonacoDiff original={original} modified={modified} filePath={filePath} />
    </Suspense>
  )
}
```

Monaco 首次加载 ~2MB（gzipped ~400KB），使用 fallback 渲染 unified diff 避免空白等待。

### 9.5 性能预算

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| FCP (First Contentful Paint) | <1.5s | Lighthouse |
| TTI (Time to Interactive) | <3s | Lighthouse |
| SSE 首 token 延迟 | <500ms | 自定义 metrics |
| 虚拟滚动 FPS | >30fps (200 条消息) | React DevTools Profiler |
| Monaco 加载时间 | <2s (cached) | Performance API |
| 内存占用 | <200MB (3 个 Tab) | Chrome Task Manager |

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
