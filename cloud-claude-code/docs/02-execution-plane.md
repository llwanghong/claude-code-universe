> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](../01-architecture-design/)


:::diagram ExecutionPlaneDiagram:::
## 1. 设计目标

执行层是云端 Claude Code 的核心——这里运行着实际的 agent loop、tool pipeline 和 sandbox。设计目标：

1. **隔离性**：一个 session 的代码执行不影响其他 session
2. **安全性**：agent 生成的命令在沙箱内执行，不能逃逸
3. **可伸缩**：session 数量可从 10 弹性到 1000+
4. **可观测**：每个 agent 的执行可追踪、可调试

---

## 2. Agent Runtime 核心设计

### 2.1 query() Loop（继承 ch05）

Agent 的核心是一个 async generator 函数。它维护一个 LoopState（messages、toolUseContext、turnCount、transition），在 while(true) 中循环执行：上下文压缩（4 层）→ 流式模型调用（带 Idle Watchdog 和 Withholding 模式）→ 工具检测与执行（14 步流水线）→ 状态重构 → 终端条件检查。返回 10 种 Terminal 状态（completed / user_abort / max_turns / blocking_limit / token_budget / stop_hook / error / approval_required 等）和 7 种 Continue 状态。完整实现见上方代码。

### 2.2 Context Manager（4 层压缩）

```typescript
// server/src/agent/context-manager.ts

export async function compressContext(
  messages: Message[],
  config: SnapshotConfig
): Promise<Message[]> {
  let result = messages

  // Layer 0: 工具结果预算（每个结果 max 50K chars）
  result = applyToolResultBudget(result, {
    maxChars: 50_000,
    maxTokens: 100_000,
    aggregateMax: 200_000,  // 整轮对话上限
  })

  // Layer 1: Snip Compact（移除旧消息）
  result = snipCompactIfNeeded(result, config.effectiveContextWindow)

  // Layer 2: Microcompact（按 tool_use_id 移除）
  result = microcompact(result, COMPACTABLE_TOOLS)

  // Layer 3: Context Collapse（用摘要替换消息片段）
  if (shouldCollapse(result, config)) {
    result = await contextCollapse(result, config)
  }

  // Layer 4: Auto-Compact（全对话摘要化）
  if (shouldAutoCompact(result, config)) {
    result = await autoCompact(result, config)
    // Circuit breaker: 连续 3 次失败 → 停止尝试
  }

  return result
}
```

### 2.3 Model Streaming

```typescript
// server/src/agent/model-streaming.ts

export async function* streamModel(
  messages: Message[],
  state: LoopState,
  config: SnapshotConfig
): AsyncGenerator<StreamEvent, AssistantMessage> {
  const model = resolveModel(config.modelRouter, state.project.securityLevel)

  // 构建请求
  const request = {
    model: model.id,
    system: buildSystemPrompt(config, state),
    messages: normalizeMessages(messages),
    tools: state.toolUseContext.tools,
    max_tokens: 8000,  // Slot Reservation（继承 ch04）
    stream: true,
  }

  // 流式处理
  const stream = await fetchModelStream(model.endpoint, request, {
    signal: state.toolUseContext.abortController.signal,
  })

  // Idle Watchdog（继承 ch04）
  let lastChunkTime = Date.now()
  const watchdog = setInterval(() => {
    if (Date.now() - lastChunkTime > 90_000) {
      state.toolUseContext.abortController.abort()
    } else if (Date.now() - lastChunkTime > 45_000) {
      log.warn('Stream idle for 45s', { sessionId: state.sessionId })
    }
  }, 5000)

  // 流式处理 + 推测执行
  const executor = new StreamingToolExecutor(state.toolUseContext)
  let assistantMessage: AssistantMessage = { role: 'assistant', content: [] }

  try {
    for await (const chunk of stream) {
      lastChunkTime = Date.now()
      const event = parseChunk(chunk)

      // 检测 tool_use block → 启动推测执行
      if (event.type === 'tool_use') {
        executor.addTool(event.toolUse, assistantMessage)
      }

      // Withholding pattern（继承 ch05）
      if (isRecoverableError(event)) {
        state.withheldErrors.push(event)
        continue
      }

      assistantMessage.content.push(event)
      yield event
    }
  } finally {
    clearInterval(watchdog)
  }

  // 排空推测完成的工具结果
  yield* executor.getRemainingResults()

  return assistantMessage
}
```

---

## 3. Tool Pipeline 设计（继承 ch06）

### 3.1 完整的 14 步流水线

工具执行流水线直接继承 Claude Code ch06 的 checkPermissionsAndCallTool()。14 步依次为：工具查找 → 中止检查 → Zod 验证 → 语义验证 → 推测性安全检查 → Input Backfill → PreToolUse Hooks → 权限解析 → 权限拒绝处理 → 工具执行 → 结果预算 → PostToolUse Hooks → 新消息注入 → 错误分类。云端扩展：如果工具标记了 requiresApproval，在步骤 8 后插入审批流（创建 Jira ticket → 等待 TL 批准 → 继续执行）。沙箱工具通过 gVisor runsc 执行。完整实现见下方代码。

### 3.2 云端工具注册表

云端工具集继承了 Claude Code 的内置工具并增加了企业工具。代码类：ReadTool / WriteTool / EditTool / GrepTool / GlobTool。Shell 类：BashTool（沙箱内执行，max 5min，命令分类器判定只读/写入/危险）。Git 类：GitTool（允许 status/diff/log/branch/checkout/add/commit/push，禁止 push --force 和 reset --hard）。企业类：BuildTool（触发 CI 构建）/ DeployTool（需审批，max 10min）/ DBTool（只读查询，max 100 行）/ TicketTool（Jira 工单）/ AgentTool（生成子 agent）。所有工具通过 buildTool() 工厂创建，继承 fail-closed 默认值（isConcurrencySafe=false, isReadOnly=false）。

### 3.3 并发执行（继承 ch07）

```typescript
// server/src/agent/concurrent-execution.ts

/**
 * 工具调用分区算法 — 继承 ch07 的 partitionToolCalls()
 */
export function partitionToolCalls(
  toolBlocks: ToolUseBlock[],
  tools: Map<string, CloudTool>
): Batch[] {
  return toolBlocks.reduce((batches, block) => {
    const tool = tools.get(block.name)
    const input = tool?.inputSchema.safeParse(block.input)
    const isSafe = input?.success ? tool.isConcurrencySafe(input.data) : false

    if (isSafe && batches.at(-1)?.isConcurrencySafe) {
      batches.at(-1)!.blocks.push(block)
    } else {
      batches.push({ isConcurrencySafe: isSafe, blocks: [block] })
    }
    return batches
  }, [] as Batch[])
}

/**
 * 批次执行
 */
export async function* executeBatches(
  batches: Batch[],
  context: CloudToolUseContext
): AsyncGenerator<ToolResult> {
  for (const batch of batches) {
    if (batch.isConcurrencySafe) {
      // 并发批次：所有工具同时运行
      yield* runConcurrently(batch.blocks, context)
    } else {
      // 串行批次：一个接一个
      for (const block of batch.blocks) {
        yield await executeTool(block, context)
      }
    }
  }
}
```

---

## 4. Shell Sandbox 设计

### 4.1 沙箱层级

Shell 沙箱采用三层嵌套隔离。最外层 K8s Agent Pod（独立网络命名空间 + Resource Limits）。中间层 gVisor (runsc) 用户态内核（拦截危险 syscall，提供与应用内核之间的安全边界）。最内层容器（只读根文件系统 + /workspace 唯一可写目录 + /tmp tmpfs + seccomp profile）。预装工具包括 git、node、python、ripgrep、fd。

### 4.2 命令分类器

```typescript
// server/src/agent/sandbox/command-classifier.ts

export type CommandCategory = 'readonly' | 'write' | 'dangerous' | 'blocked'

export function classifyCommand(command: string): CommandCategory {
  // 解析复合命令
  const subcommands = splitCommandWithOperators(command)

  for (const cmd of subcommands) {
    // 阻止列表 — 永远不允许
    if (BLOCKED_COMMANDS.has(cmd.binary)) return 'blocked'
    // 危险列表 — 需要审批
    if (DANGEROUS_COMMANDS.has(cmd.binary)) return 'dangerous'
  }

  // 所有子命令都是只读？
  const allReadonly = subcommands.every(cmd =>
    READONLY_COMMANDS.has(cmd.binary)
  )
  return allReadonly ? 'readonly' : 'write'
}

const BLOCKED_COMMANDS = new Set([
  'sudo', 'mount', 'umount', 'mkfs',
  'iptables', 'systemctl', 'reboot', 'shutdown',
  'chown', 'chmod 777', 'wget', 'curl',  // 网络操作在 NetworkPolicy 限制
])

const READONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc',
  'grep', 'rg', 'find', 'fd',
  'git status', 'git log', 'git diff', 'git show',
  'node --version', 'npm ls', 'python --version',
  'echo', 'printf', 'pwd', 'which', 'env',
])
```

### 4.3 资源限制

```typescript
// server/src/agent/sandbox/limits.ts

export const SANDBOX_LIMITS = {
  // 进程限制
  maxProcesses: 20,           // 最多 20 个并发子进程
  maxProcessMemory: '512Mi',  // 单进程最大内存
  maxFileDescriptors: 100,    // 文件描述符上限

  // 时间限制
  commandTimeout: 300_000,    // 单个命令 5min
  totalExecutionTime: 3_600_000, // 总执行时间 1h

  // 磁盘限制
  workspaceQuota: '10Gi',
  tmpfsQuota: '1Gi',

  // 网络限制（gVisor netstack）
  allowedEgress: [
    'internal-registry.company.com',
    'api.anthropic.com',
    'github.com',              // git clone/push
  ],
  blockedEgress: ['0.0.0.0/0'], // 默认拒绝所有

  // seccomp
  blockedSyscalls: [
    'ptrace', 'mount', 'kexec_load',
    'init_module', 'finit_module', 'delete_module',
    'add_key', 'request_key',
  ],
}
```

---

## 5. Repository Workspace 管理

### 5.1 分层缓存架构

每个 Agent Pod 需要访问代码仓库，但每次从 GitLab/Bitbucket 全量 clone 是不现实的（大仓库可能数 GB，clone 耗时 5-10 分钟）。我们采用三层缓存：

```
Layer 1: Repo Cache (bare repos on SSD, Node-local)
  ↓  git clone --shared --reference
Layer 2: CoW Overlay (per-Agent thin copy, <1s 创建)
  ↓  agent 所有写入
Layer 3: Workspace Volume (只读 base + 可写 overlay)
```

**Layer 1 — Repo Cache**：在 K8s Node 上维护常用仓库的 bare clone（`git clone --bare`），每 5 分钟 `git fetch` 更新。Cache 淘汰策略：LRU，保留最近 20 个仓库。

```typescript
// server/src/workspace/repo-cache.ts

export class RepoCache {
  private cacheDir = '/var/cache/repos'
  private maxRepos = 20
  private accessOrder: string[] = []  // LRU 链表

  async getOrClone(repoUrl: string): Promise<string> {
    const cacheKey = this.repoKey(repoUrl)
    const barePath = `${this.cacheDir}/${cacheKey}`

    if (existsSync(barePath)) {
      // 更新 LRU
      this.touch(cacheKey)
      // 异步 fetch 最新
      this.fetchBg(barePath).catch(() => {})
      return barePath
    }

    // 首次 clone
    await this.cloneBare(repoUrl, barePath)
    this.evictIfNeeded()
    return barePath
  }

  private async cloneBare(url: string, path: string): Promise<void> {
    await exec('git', ['clone', '--bare', '--depth=50', url, path], {
      timeout: 120_000,
    })
  }

  private async fetchBg(path: string): Promise<void> {
    await exec('git', ['-C', path, 'fetch', '--depth=50'], {
      timeout: 30_000,
    })
  }
}
```

### 5.2 CoW Workspace 创建

Agent 启动时，不直接操作 bare repo，而是通过 overlay 创建可写 workspace：

```typescript
// server/src/workspace/cow-workspace.ts

export async function createCowWorkspace(
  bareRepoPath: string,
  agentId: string,
  branch: string,
): Promise<Workspace> {
  const wsPath = `/workspaces/${agentId}`

  // Step 1: 创建 overlay 目录结构
  await fs.mkdir(`${wsPath}/upper`, { recursive: true })   // 可写层
  await fs.mkdir(`${wsPath}/work`, { recursive: true })    // overlay workdir
  await fs.mkdir(`${wsPath}/merged`, { recursive: true })  // 合并视图

  // Step 2: 挂载 overlayfs（lower=bare repo[只读], upper=可写层）
  await exec('mount', [
    '-t', 'overlay', 'overlay',
    '-o', [
      `lowerdir=${bareRepoPath}`,
      `upperdir=${wsPath}/upper`,
      `workdir=${wsPath}/work`,
    ].join(','),
    `${wsPath}/merged`,
  ])

  // Step 3: 在 merged 中创建临时分支
  await exec('git', [
    '-C', `${wsPath}/merged`,
    'checkout', '-b', `agent-${agentId}-${Date.now()}`,
    `origin/${branch}`,
  ])

  return {
    path: `${wsPath}/merged`,
    branch: `agent-${agentId}`,
    baseBranch: branch,
    agentId,
  }
}
```

### 5.3 修改隔离与清理

- **修改隔离**：每个 Agent 的 upper 层独立，修改互不可见。Agent A 在 `/workspaces/agent-a/merged/src/` 的写入不会影响 Agent B。
- **临时分支**：所有 commit 在 `agent-{uuid}` 分支上，绝不污染 main/master。
- **清理策略**：Agent Pod 销毁时，卸载 overlay、删除 upper/work 目录。TTL 兜底：24h 后自动清理。

```typescript
// server/src/workspace/cleanup.ts

export async function cleanupWorkspace(ws: Workspace): Promise<void> {
  const wsPath = `/workspaces/${ws.agentId}`

  // 1. 卸载 overlay
  await exec('umount', [`${wsPath}/merged`]).catch(() => {})

  // 2. 删除 upper/work 层
  await fs.rm(`${wsPath}/upper`, { recursive: true, force: true })
  await fs.rm(`${wsPath}/work`, { recursive: true, force: true })

  // 3. 如果临时分支已 push，删除远程分支（可选）
  if (ws.pushed) {
    await exec('git', [
      'push', 'origin', '--delete', ws.branch,
    ]).catch(() => {})
  }

  // 4. 审计日志
  auditLog.info('workspace_cleaned', {
    agentId: ws.agentId,
    branch: ws.branch,
    filesCreated: ws.stats.filesCreated,
    filesModified: ws.stats.filesModified,
  })
}
```

### 5.4 并发安全

多个 Agent 操作同一仓库时的并发控制：

| 场景 | 风险 | 策略 |
|------|------|------|
| 同文件同区域编辑 | 合并冲突 | Agent 不互相感知，PR 合并时人工解决 |
| 同分支 push | 冲突 | 临时分支命名含 uuid，天然隔离 |
| Bare repo fetch 时 clone | 不一致 | Read-Write Lock（fetch 持读锁，clone 持写锁） |
| Workspace 清理时 Agent 仍活跃 | 数据丢失 | 清理前检查 Agent Pod 是否存在 |

---

## 6. 错误恢复

### 6.1 升级阶梯（继承 ch05）

错误恢复采用分层升级策略。Prompt Too Long：先尝试 Context Collapse Drain → 失败则 Reactive Compact（仅一次）→ 仍失败则返回 terminal。Max Output Tokens：8K → 64K escalation → 多轮恢复（最多 3 次）。Model Unavailable：fallback 到备用模型。Network Error：指数退避重试（最多 3 次）。Sandbox Escape：不重试，立即终止并触发安全告警。所有重试机制都有 circuit breaker（连续 3 次失败打开断路器，60s 后半开尝试）。

### 6.2 Circuit Breaker（防止无限重试）

```typescript
// server/src/agent/circuit-breaker.ts

export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(
    private maxFailures = 3,
    private resetTimeout = 60_000  // 1min
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open'
      } else {
        throw new CircuitBreakerOpenError()
      }
    }

    try {
      const result = await fn()
      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failures = 0
      }
      return result
    } catch (error) {
      this.failures++
      this.lastFailureTime = Date.now()
      if (this.failures >= this.maxFailures) {
        this.state = 'open'
      }
      throw error
    }
  }
}

// 应用场景：
// - Auto-compact circuit breaker（ch05 模式）
// - MCP 连接重试（ch15 模式）
// - 模型 fallback（ch04 模式）
```

---

## 7. 可观测性

### 7.1 Agent Session 的追踪

```typescript
// server/src/agent/tracing.ts

export function createAgentSpan(
  sessionId: string,
  traceId: string
): AgentSpan {
  return {
    sessionId,
    traceId,
    startTime: Date.now(),
    events: [],

    // 每个关键步骤记录事件
    recordModelCall(model: string, inputTokens: number, outputTokens: number): void,
    recordToolCall(tool: string, duration: number, result: 'success' | 'error'): void,
    recordCompaction(layer: string, tokensFreed: number): void,
    recordError(type: string, recovered: boolean): void,
    recordTerminal(reason: string): void,

    // 结束时导出
    finish(): SessionTrace {
      return {
        sessionId: this.sessionId,
        traceId: this.traceId,
        duration: Date.now() - this.startTime,
        modelCalls: this.modelCalls,
        toolCalls: this.toolCalls,
        compactions: this.compactions,
        errors: this.errors,
        terminal: this.terminalReason,
      }
    }
  }
}
```

### 7.2 关键指标

```typescript
// Prometheus metrics
export const AGENT_METRICS = {
  // Agent 级别
  agent_sessions_active: Gauge,        // 活跃 session 数
  agent_session_duration_seconds: Histogram,
  agent_turns_total: Counter,          // 总轮次数
  agent_terminal_reasons: Counter,     // 按终止原因分组

  // 模型级别
  model_calls_total: Counter,          // 按模型分组
  model_input_tokens: Counter,
  model_output_tokens: Counter,
  model_latency_seconds: Histogram,

  // 工具级别
  tool_calls_total: Counter,           // 按工具名分组
  tool_success_rate: Gauge,
  tool_execution_seconds: Histogram,
  tool_permission_denials: Counter,

  // 压缩
  compaction_triggers_total: Counter,
  compaction_tokens_freed: Counter,

  // 错误
  error_recovery_attempts: Counter,
  circuit_breaker_trips: Counter,
}
```
