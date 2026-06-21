# 第 15 章：MCP — 通用工具协议

## 为什么 MCP 超越 Claude Code 重要

本书中其他所有章节都是关于 Claude Code 的内部机制。本章不同。Model Context Protocol 是任何 agent 都可以实现的开放规范，Claude Code 的 MCP 子系统是存在的最完整的生产客户端之一。如果你正在构建需要调用外部工具的 agent——任何 agent、任何语言、任何模型——本章中的模式直接可转移。

核心命题是直接的：MCP 定义了客户端（agent）和服务器（工具提供者）之间用于工具发现和调用的 JSON-RPC 2.0 协议。客户端发送 `tools/list` 来发现服务器提供什么，然后 `tools/call` 来执行。服务器以名称、描述和输入的 JSON Schema 描述每个工具。这就是整个契约。其他一切——传输选择、认证、配置加载、工具名称规范化——是使干净规范在与现实世界接触后存活的实现工作。

Claude Code 的 MCP 实现横跨四个核心文件：`types.ts`、`client.ts`、`auth.ts` 和 `InProcessTransport.ts`。它们共同支持八种传输类型、七个配置范围、跨两个 RFC 的 OAuth 发现，以及使 MCP 工具与内置工具无法区分的工具包装层——与第 6 章覆盖的相同的 `Tool` 接口。本章遍历每一层。

---

## 八种传输类型

任何 MCP 集成中的第一个设计决策是客户端如何与服务器通信。Claude Code 支持八种传输配置：

```mermaid
flowchart TD
    Q{Where is the<br/>MCP server?}
    Q -->|Same machine| LOCAL
    Q -->|Remote service| REMOTE
    Q -->|Same process| INPROC
    Q -->|IDE extension| IDE

    subgraph LOCAL["Local Process"]
        STDIO["stdio<br/>stdin/stdout JSON-RPC<br/>Default, no auth"]
    end

    subgraph REMOTE["Remote Server"]
        HTTP["http (Streamable HTTP)<br/>Current spec, POST + optional SSE"]
        SSE["sse (Server-Sent Events)<br/>Legacy transport, pre-2025"]
        WS["ws (WebSocket)<br/>Bidirectional, rare"]
        PROXY["claudeai-proxy<br/>Via Claude.ai infrastructure"]
    end

    subgraph INPROC["In-Process"]
        SDK["sdk<br/>Control messages over stdin/stdout"]
        LINKED["InProcessTransport<br/>Direct function calls, 63 lines"]
    end

    subgraph IDE["IDE Extension"]
        SSEIDE["sse-ide"]
        WSIDE["ws-ide"]
    end

    style STDIO fill:#c8e6c9
    style HTTP fill:#bbdefb
```

三个设计选择值得注意。第一，`stdio` 是默认——当 `type` 被省略时，系统假设本地子进程。这与最早的 MCP 配置向后兼容。第二，fetch 包装器是层叠的：超时包装在 step-up 检测之外，在基础 fetch 之外。每个包装器处理一个关注点。第三，`ws-ide` 分支有 Bun/Node 运行时分离——Bun 的 `WebSocket` 原生接受代理和 TLS 选项，而 Node 需要 `ws` 包。

**何时使用哪个。** 对于本地工具（文件系统、数据库、自定义脚本），`stdio`——无网络、无认证，只是管道。对于远程服务，`http`（Streamable HTTP）是当前规范推荐。`sse` 是遗留但广泛部署。`sdk`、IDE 和 `claudeai-proxy` 类型是其各自生态系统的内部传输。

---

## 配置加载和范围

MCP 服务器配置从七个范围加载，合并并去重：

| 范围 | 来源 | 信任 |
|------|------|------|
| `local` | 工作目录中的 `.mcp.json` | 需要用户批准 |
| `user` | `~/.claude.json` mcpServers 字段 | 用户管理 |
| `project` | 项目级配置 | 共享项目设置 |
| `enterprise` | 管理的企业配置 | 组织预批准 |
| `managed` | 插件提供的服务器 | 自动发现 |
| `claudeai` | Claude.ai web 接口 | 通过 web 预授权 |
| `dynamic` | 运行时注入（SDK） | 编程添加 |

**去重是基于内容的，不是基于名称的。** 两个具有不同名称但相同命令或 URL 的服务器被识别为同一服务器。`getMcpServerSignature()` 函数计算规范键：本地服务器为 `stdio:["command","arg1"]`，远程服务器为 `url:https://example.com/mcp`。签名匹配手动配置的插件提供的服务器被压制。

---

## 工具包装：从 MCP 到 Claude Code

当连接成功时，客户端调用 `tools/list`。每个工具定义被转换为 Claude Code 的内部 `Tool` 接口——与内置工具使用的相同接口。包装后，模型无法区分内置工具和 MCP 工具。

包装过程有四个阶段：

**1. 名称规范化。** `normalizeNameForMCP()` 将无效字符替换为下划线。全限定名遵循 `mcp__{serverName}__{toolName}`。

**2. 描述截断。** 上限 2,048 字符。基于 OpenAPI 的服务器曾被观察到向 `tool.description` 转储 15-60KB——单个工具每次大约 15,000 token。上限防止单个工具膨胀整个上下文窗口。

**3. Schema 透传。** 工具的 `inputSchema` 直接传递给 API。包装时不转换、不验证。Schema 错误在调用时浮现，而非注册时——如果 MCP 服务器的 schema 有 bug，它导致运行时错误而非注册时静默腐败。

**4. 注解映射。** MCP 注解映射到行为标志：`readOnlyHint` 标记工具为并发执行安全（如第 7 章的流式执行器所讨论），`destructiveHint` 触发额外权限审查。这些注解来自 MCP 服务器——恶意服务器可以将破坏性工具标记为只读。这是一个被接受的信任边界，但值得理解：用户选择了加入该服务器，恶意服务器将破坏性工具标记为只读是真实的攻击向量。系统接受此权衡因为替代方案——完全忽略注解——将阻止合法服务器改善用户体验。

---

## MCP 服务器的 OAuth

远程 MCP 服务器通常需要认证。Claude Code 实现了完整的 OAuth 2.0 + PKCE 流，带有基于 RFC 的发现、跨应用访问和错误正文规范化。

### 发现链

```mermaid
flowchart TD
    A[Server returns 401] --> B["RFC 9728 probe<br/>GET /.well-known/oauth-protected-resource"]
    B -->|Found| C["Extract authorization_servers[0]"]
    C --> D["RFC 8414 discovery<br/>against auth server URL"]
    B -->|Not found| E["RFC 8414 fallback<br/>against MCP server URL with path-aware probing"]
    D -->|Found| F[Authorization Server Metadata<br/>token endpoint, auth endpoint, scopes]
    E -->|Found| F
    D -->|Not found| G{authServerMetadataUrl<br/>configured?}
    E -->|Not found| G
    G -->|Yes| H[Direct metadata fetch<br/>bypass discovery]
    G -->|No| I[Fail: no auth metadata]
    H --> F

    style F fill:#c8e6c9
    style I fill:#ffcdd2
```

`authServerMetadataUrl` 逃生口存在是因为某些 OAuth 服务器实现了两个 RFC 都不实现。发现是分层的：首先尝试 RFC 9728（OAuth 保护资源元数据）来找到授权服务器 URL。如果没找到，回退到对 MCP 服务器 URL 本身的 RFC 8414 发现，带路径感知探测。如果两者都失败且配置了 `authServerMetadataUrl`，则使用直接元数据获取。否则，认证不可能——服务器无法受到保护。

### 跨应用访问（XAA）

当 MCP 服务器配置有 `oauth.xaa: true` 时，系统通过身份提供者进行联邦 token 交换——一个 IdP 登录解锁多个 MCP 服务器。这是最常见的 MCP 服务器认证路径，因为它让用户认证一次并访问整个生态系统。

### 错误正文规范化

`normalizeOAuthErrorBody()` 函数处理违反规范的 OAuth 服务器。Slack 对错误响应返回 HTTP 200，错误埋在 JSON 正文中。函数窥视 2xx POST 响应正文，当正文匹配 `OAuthErrorResponseSchema` 但不匹配 `OAuthTokensSchema` 时，将响应重写为 HTTP 400。它还规范化 Slack 特定的错误码（`invalid_refresh_token`、`expired_refresh_token`、`token_expired`）为标准 `invalid_grant`。没有此函数，Slack MCP 集成的错误处理将在每个 token 刷新周期中静默失败。

---

## 进程内传输

不是每个 MCP 服务器都需要是单独的进程。`InProcessTransport` 类使在同一进程中运行 MCP 服务器和客户端成为可能：

```typescript
class InProcessTransport implements Transport {
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error('Transport is closed')
    queueMicrotask(() => { this.peer?.onmessage?.(message) })
  }
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.onclose?.()
    if (this.peer && !this.peer.closed) {
      this.peer.closed = true
      this.peer.onclose?.()
    }
  }
}
```

整个文件 63 行。两个设计决策值得关注。第一，`send()` 通过 `queueMicrotask()` 交付以防止同步请求/响应周期中的栈深度问题——没有它，深度嵌套的 MCP 调用可能导致栈溢出。第二，`close()` 级联到 peer，将双方都标记为关闭并防止半开状态。Chrome MCP 服务器和 Computer Use MCP 服务器都使用此模式。

---

## 连接管理

### 连接状态

每个 MCP 服务器连接存在于五种状态之一：`connected`（活跃且接受请求）、`failed`（永久失败，不会重试）、`needs-auth`（服务器返回 401，需要 OAuth——带有 15 分钟 TTL 缓存以防止 30 个服务器独立发现相同过期 token）、`pending`（初始连接进行中）或 `disabled`（被策略或用户显式禁用）。

### 会话到期检测

MCP 的 Streamable HTTP 传输使用会话 ID。当服务器重启时，请求返回 HTTP 404 并带有 JSON-RPC 错误码 -32001。`isMcpSessionExpiredError()` 函数检查两个信号——注意它使用字符串包含来检测错误码，这实用但脆弱：

```typescript
export function isMcpSessionExpiredError(error: Error): boolean {
  const httpStatus = 'code' in error ? (error as any).code : undefined
  if (httpStatus !== 404) return false
  return error.message.includes('"code":-32001') ||
    error.message.includes('"code": -32001')
}
```

检测到时，连接缓存清除且调用重试一次。

### 批量连接

本地服务器以 3 个一批连接（生成进程可能耗尽文件描述符），远程服务器以 20 个一批。React 上下文提供者 `MCPConnectionManager.tsx` 管理生命周期，diff 当前连接对照新配置——添加新服务器、移除已删除的、更新已改变 URL 的。

---

## Claude.ai 代理传输

`claudeai-proxy` 传输说明了一个常见的 agent 集成模式：通过中介连接。Claude.ai 订阅者通过 web 接口配置 MCP "连接器"，CLI 通过 Claude.ai 的基础设施路由，该基础设施处理供应商侧 OAuth。

`createClaudeAiProxyFetch()` 函数在请求时捕获 `sentToken`，不在 401 后重新读取。在来自多个连接器的并发 401 下，另一个连接器的重试可能已经刷新了 token。函数还在刷新处理器返回 false 时检查并发刷新——"ELOCKED contention"情况，其中另一个连接器赢得了锁文件竞速。

---

## 超时架构

MCP 超时是分层的，每个防范不同的故障模式：

| 层 | 持续时间 | 防范 |
|-----|---------|------|
| 连接 | 30s | 不可达或慢启动的服务器 |
| 每请求 | 60s（每个请求刷新） | 过时超时信号 bug |
| 工具调用 | ~27.8 小时 | 合法长时间操作 |
| Auth | 每个 OAuth 请求 30s | 不可达的 OAuth 服务器 |

每请求超时值得强调。早期实现在连接时创建了单一的 `AbortSignal.timeout(60000)`。60 秒空闲时间后，下一个请求将立即中止——信号已经过期。修复：`wrapFetchWithTimeout()` 为每个请求创建新鲜的超时信号。它还作为最后一步防御规范化 `Accept` header，防止运行时和代理丢弃它。

---

## Apply This：将 MCP 集成到你自己的 Agent

**从 stdio 开始，后续添加复杂性。** `StdioClientTransport` 处理一切：生成、管道、杀死。一行配置，一个传输类，你就有 MCP 工具了。在需要之前不要引入 OAuth 或远程传输。

**规范化名称和截断描述。** 名称必须匹配 `^[a-zA-Z0-9_-]{1,64}$`。以前缀 `mcp__{serverName}__` 开头以避免与内置工具冲突。将描述上限设为 2,048 字符——基于 OpenAPI 的服务器否则会浪费上下文 token。这个上限防止了单个过于冗长的 MCP 工具定义膨胀整个系统提示的现实问题。

**惰性处理认证。** 在服务器返回 401 之前不要尝试 OAuth。大多数 stdio 服务器不需要认证。提前进行 OAuth 发现是浪费的——对于从未调用其工具的无认证 stdio 服务器，你做了 OAuth 握手。

**对内置服务器使用进程内传输。** `createLinkedTransportPair()` 为你控制的服务器消除子进程开销。63 行的 `InProcessTransport` 在大多数情况下是正确选择，其中 MCP 服务器是你也维护的库。

**尊重工具注解并清理输出。** `readOnlyHint` 启用并发执行——对搜索和读取工具的大幅性能提升。`destructiveHint` 值得额外权限审查。清理响应中的恶意 Unicode（双向覆盖、零宽连接符）以防止模型被误导——这些字符可以反转或隐藏工具输出中的文本，对使用 MCP 工具输出的 agent 造成安全风险。

MCP 协议是故意最小化的——两个 JSON-RPC 方法。这些方法和生产部署之间的一切都是工程：八种传输、七个配置范围、两个 OAuth RFC 和超时分层。Claude Code 的实现展示了该工程在规模上是什么样子。

下一章检查当 agent 延伸到 localhost 之外时发生什么：让 Claude Code 在云容器中运行、从 web 浏览器接受指令、并通过凭证注入代理隧道 API 流量的远程执行协议。
