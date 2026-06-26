# 执行层详细设计

> 版本：v1.0 | 日期：2026-06-26 | 依赖：[总体架构](./01-architecture-design.md)

## 1. 设计目标

执行层是云端 Claude Code 的核心——这里运行着实际的 agent loop、tool pipeline 和 sandbox。设计目标：

1. **隔离性**：一个 session 的代码执行不影响其他 session
2. **安全性**：agent 生成的命令在沙箱内执行，不能逃逸
3. **可伸缩**：session 数量可从 10 弹性到 1000+
4. **可观测**：每个 agent 的执行可追踪、可调试

---

## 2. Agent Runtime 核心设计

### 2.1 query() Loop（继承 ch05）

```typescript
// server/src/agent/query-loop.ts

/**
 * 云端 Agent 的核心循环。
 * 继承 Claude Code ch05 的 async generator 模式。
 */
export async function* query(params: QueryParams): AsyncGenerator<
  StreamEvent | Message | TerminalEvent,
  Terminal
> {
  // ── 初始化 ──────────────────────────────
  const config = await snapshotConfig(params)  // 一次性快照，不再重读
  let state = initState(params, config)

  // ── 主循环 ──────────────────────────────
  while (true) {
    // 第 1 步：上下文压缩（4 层）
    const messages = await compressContext(state, config)

    // 第 2 步：模型调用
    let assistantMessage: AssistantMessage
    try {
      assistantMessage = yield* streamModel(messages, state, config)
    } catch (error) {
      // 错误恢复阶梯（继承 ch05）
      const recovery = yield* attemptRecovery(error, state)
      if (recovery === 'retry') continue
      return { reason: recovery }
    }

    // 第 3 步：检测工具调用
    const toolBlocks = extractToolBlocks(assistantMessage)
    if (toolBlocks.length === 0) {
      // 没有工具调用 — 检查是否真的完成
      const stopResult = yield* runStopHooks(state)
      if (stopResult.blocking) {
        state = appendError(state, stopResult.errors)
        state.transition = { reason: 'stop_hook_blocking' }
        continue
      }
      return { reason: 'completed' }
    }

    // 第 4 步：执行工具
    const toolResults = yield* executeTools(toolBlocks, state)

    // 第 5 步：重构状态，继续循环
    state = reconstructState(state, assistantMessage, toolResults)

    // 第 6 步：检查终端条件
    if (state.turnCount >= (params.maxTurns ?? 100)) {
      return { reason: 'max_turns' }
    }
    if (checkTokenBudget(state)) {
      return { reason: 'token_budget' }
    }
  }
}

// ── 状态定义 ──────────────────────────────
interface LoopState {
  messages: Message[]
  toolUseContext: CloudToolUseContext
  turnCount: number
  transition: Continue | undefined
  autoCompactTracking: AutoCompactTracking
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  pendingToolUseSummary?: Promise<ToolUseSummaryMessage | null>
  stopHookActive: boolean
}

// ── 终端状态（继承 ch05）──────────────────
type Terminal =
  | { reason: 'completed' }
  | { reason: 'user_abort' }
  | { reason: 'max_turns' }
  | { reason: 'blocking_limit' }
  | { reason: 'token_budget' }
  | { reason: 'stop_hook' }
  | { reason: 'error'; error: CloudAgentError }
  | { reason: 'approval_required'; pendingAction: PendingApproval }
```

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

```typescript
// server/src/agent/tool-pipeline.ts

/**
 * 云端工具执行流水线。
 * 继承 Claude Code ch06 的 checkPermissionsAndCallTool() 模式。
 */
export async function executeTool(
  toolBlock: ToolUseBlock,
  context: CloudToolUseContext
): Promise<ToolResult> {
  // ── 步骤 1: 工具查找 ───────────────────
  const tool = findTool(toolBlock.name, context.tools)
  if (!tool) throw new ToolNotFoundError(toolBlock.name)

  // ── 步骤 2: 中止检查 ───────────────────
  if (context.abortController.signal.aborted) {
    return { type: 'aborted' }
  }

  // ── 步骤 3: Zod 验证 ───────────────────
  const parsed = tool.inputSchema.safeParse(toolBlock.input)
  if (!parsed.success) {
    return { type: 'validation_error', errors: parsed.error }
  }

  // ── 步骤 4: 语义验证 ───────────────────
  const semanticError = tool.validateInput?.(parsed.data)
  if (semanticError) return { type: 'semantic_error', error: semanticError }

  // ── 步骤 5: 推测性安全检查 ─────────────
  const classifierPromise = startSecurityClassifier(tool, parsed.data, context)

  // ── 步骤 6: Input Backfill ──────────────
  const backfilled = backfillInput(parsed.data, context.workspace)

  // ── 步骤 7: PreToolUse Hooks ────────────
  const hookResult = await executeHooks('PreToolUse', {
    toolName: tool.name,
    input: backfilled,
    context,
  })
  if (hookResult.deny) return { type: 'hook_denied', reason: hookResult.reason }
  if (hookResult.stop) return { type: 'stopped' }

  // ── 步骤 8: 权限解析 ───────────────────
  const permission = resolvePermission(tool, backfilled, context)
  // 企业扩展：审批流
  if (tool.requiresApproval && permission.mode !== 'bypassPermissions') {
    const approval = await createApprovalTicket(tool, backfilled, context)
    context.yield({ type: 'approval_pending', approval })
    await waitForApproval(approval.id)
  }

  // ── 步骤 9: 权限拒绝处理 ───────────────
  if (permission.decision === 'deny') {
    return { type: 'permission_denied' }
  }

  // ── 步骤 10: 工具执行 ──────────────────
  const startTime = Date.now()
  let result: ToolOutput
  try {
    // 根据工具类型选择执行环境
    if (tool.sandboxRequired) {
      result = await executeInSandbox(tool, backfilled, context.sandbox)
    } else {
      result = await tool.call(backfilled, context)
    }
  } catch (error) {
    // 步骤 14a: 错误分类
    const classified = classifyError(error, tool)
    return { type: 'execution_error', ...classified }
  }

  const duration = Date.now() - startTime

  // ── 步骤 11: 结果预算 ──────────────────
  const budgeted = applyResultBudget(result, tool.maxResultSizeChars)

  // ── 步骤 12: PostToolUse Hooks ──────────
  const postResult = await executeHooks('PostToolUse', {
    toolName: tool.name,
    result: budgeted,
    context,
  })

  // ── 步骤 13: 新消息注入 ─────────────────
  const newMessages = collectNewMessages(tool, result, context)

  return {
    type: 'success',
    data: budgeted,
    newMessages: [...newMessages, ...postResult.messages],
    duration,
    metrics: { toolName: tool.name, inputSize: JSON.stringify(backfilled).length, outputSize: budgeted.length }
  }
}
```

### 3.2 云端工具注册表

```typescript
// server/src/tools/registry.ts

const CLOUD_TOOLS: CloudTool[] = [
  // ── 代码操作 ──
  ReadTool({ sandboxRequired: false }),
  WriteTool({ sandboxRequired: true }),
  EditTool({ sandboxRequired: true }),

  // ── 搜索 ──
  GrepTool({ sandboxRequired: false }),
  GlobTool({ sandboxRequired: false }),

  // ── Shell ──
  BashTool({
    sandboxRequired: true,
    maxExecutionTime: 300_000,  // 5min
    commandClassifier: classifyCommand,  // 只读/写入/危险
  }),

  // ── Git ──
  GitTool({
    sandboxRequired: true,
    allowedOperations: [
      'status', 'diff', 'log', 'branch',
      'checkout -b', 'add', 'commit', 'push'
    ],
    disallowedOperations: [
      'push --force', 'reset --hard'
    ]
  }),

  // ── 构建/部署（云端特有）──
  BuildTool({
    requiresApproval: false,
    sandboxRequired: false,  // 调用外部 CI API
    allowedEnvironments: ['staging'],
  }),

  DeployTool({
    requiresApproval: true,
    approvalTicketType: 'jira',
    sandboxRequired: false,
    maxExecutionTime: 600_000,  // 10min
  }),

  // ── 数据库（只读）──
  DBTool({
    requiresApproval: false,
    sandboxRequired: false,
    readOnly: true,
    maxResultRows: 100,
  }),

  // ── 工单系统 ──
  TicketTool({
    requiresApproval: false,
    sandboxRequired: false,
  }),

  // ── 子 Agent ──
  AgentTool({
    requiresApproval: false,
    sandboxRequired: false,
  }),
]
```

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

```
┌──────────────────────────────────────────────┐
│              Agent Pod (K8s)                  │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │         gVisor Sandbox (runsc)         │  │
│  │                                         │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Container                        │  │  │
│  │  │  - 只读根文件系统                  │  │  │
│  │  │  - /workspace: 唯一可写目录        │  │  │
│  │  │  - /tmp: 临时文件（内存 tmpfs）    │  │  │
│  │  │  - 预装工具: git, node, python,   │  │  │
│  │  │    ripgrep, fd                    │  │  │
│  │  │  - 每个命令: seccomp profile      │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

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

## 5. Workspace 生命周期

```
┌──────────────────────────────────────────────────────┐
│              Workspace Lifecycle                       │
│                                                       │
│  Session Start                                        │
│       │                                               │
│       ▼                                               │
│  ┌──────────┐                                         │
│  │ 1. Clone │  git clone --shared --reference         │
│  │    (快)   │  <cache>/myapp.git → /ws/{uuid}        │
│  └────┬─────┘                                         │
│       │                                               │
│       ▼                                               │
│  ┌──────────┐                                         │
│  │ 2. Branch│  git checkout -b agent-{uuid}           │
│  └────┬─────┘                                         │
│       │                                               │
│       ▼                                               │
│  ┌──────────┐                                         │
│  │ 3. Work  │  Agent 在这个 workspace 中读/写/执行    │
│  │          │  所有修改在临时分支上                    │
│  └────┬─────┘                                         │
│       │                                               │
│  ┌────┴────┐                                          │
│  ▼         ▼                                          │
│ Success   Failure                                     │
│  │         │                                          │
│  ▼         ▼                                          │
│ PR Created  Workspace Discarded                       │
│  │         │                                          │
│  ▼         │                                          │
│ Cleanup ◀──┘                                          │
│  - 删除 workspace volume                              │
│  - 删除临时分支（如果 PR 已合并/拒绝）                │
│  - 更新 session 状态                                  │
└──────────────────────────────────────────────────────┘
```

---

## 6. 错误恢复

### 6.1 升级阶梯（继承 ch05）

```typescript
// server/src/agent/error-recovery.ts

export async function* attemptRecovery(
  error: CloudAgentError,
  state: LoopState
): AsyncGenerator<StreamEvent, RecoveryResult> {
  switch (error.type) {
    // ── Prompt Too Long ──
    case 'prompt_too_long':
      // Step 1: Context Collapse Drain
      if (state.contextCollapse.canDrain()) {
        yield* drainCollapses(state)
        state.transition = { reason: 'collapse_drain_retry' }
        return 'retry'
      }
      // Step 2: Reactive Compact
      if (!state.hasAttemptedReactiveCompact) {
        state.hasAttemptedReactiveCompact = true
        state.messages = await reactiveCompact(state.messages, state.config)
        state.transition = { reason: 'reactive_compact_retry' }
        return 'retry'
      }
      return 'prompt_too_long'

    // ── Max Output Tokens ──
    case 'max_output_tokens':
      // Step 1: 8K → 64K escalation
      if (!state.maxOutputTokensOverride) {
        state.maxOutputTokensOverride = 64_000
        state.transition = { reason: 'max_output_tokens_escalate' }
        return 'retry'
      }
      // Step 2: Multi-turn recovery (max 3)
      if (state.maxOutputTokensRecoveryCount < 3) {
        state.maxOutputTokensRecoveryCount++
        state.transition = { reason: 'max_output_tokens_recovery' }
        return 'retry'
      }
      return 'max_output_tokens_exhausted'

    // ── Model Unavailable ──
    case 'model_unavailable':
      if (state.config.fallbackModel) {
        state.currentModel = state.config.fallbackModel
        return 'retry'
      }
      return 'model_error'

    // ── Network Error ──
    case 'network_error':
      if (state.retryCount < 3) {
        state.retryCount++
        await sleep(exponentialBackoff(state.retryCount))
        return 'retry'
      }
      return 'network_error'

    // ── Sandbox Escape Detected ──
    case 'sandbox_escape':
      // 不重试，立即终止 + 安全告警
      await triggerSecurityAlert(error, state)
      return 'security_termination'

    default:
      return 'error'
  }
}
```

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
