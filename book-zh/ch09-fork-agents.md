# 第 9 章：Fork Agent 与 Prompt Cache

## 百分之九十五的洞察

当父 agent 并行生成五个子 agent 时，每个子 API 请求的压倒性多数是相同的。System prompt 相同。工具定义相同。对话历史相同。触发生成的 assistant 消息相同。唯一不同的是最终指令："你处理数据库迁移"、"你写测试"、"你更新文档"。

在一个典型的带热对话的 fork 中，共享前缀可能是 80,000 token。每个子的指令可能是 200 token。那是 99.75% 的重叠。Anthropic 的 prompt caching 在缓存的输入 token 上给 90% 折扣。如果你能让第 2 到第 5 个子那 80,000 token 命中缓存，你刚刚将这四个请求的输入成本削减了 90%。对父来说，这是在相同并行分发上花费 $4 和花费 $0.50 的区别。

关键在于 prompt caching 是逐字节精确的。不是"足够相似"。不是"语义等价"。字节必须匹配，逐字符，从 system prompt 的第一个字节到每个子内容发散前的最后一个字节。一个额外的空格、一个重新排序的工具定义、一个过时的 feature flag 改变 system prompt 片段——缓存未命中。整个前缀以全价重新处理。

Fork agent 是 Claude Code 对此约束的回答。它们不仅仅是"带上下文生成子"的便利——它们是伪装成编排功能的 prompt cache 利用机制。Fork 系统中的每个设计决策追溯到一个问题：我们如何保证跨并行子的逐字节相同前缀？

---

## Fork 子继承什么

Fork agent 从父继承四样东西，以引用或逐字节副本方式继承，而非通过重新计算。

**1. System prompt。** 不重新生成——传递。父已渲染的 system prompt 字节通过 `override.systemPrompt` 传递，从 `toolUseContext.renderedSystemPrompt` 拉取。这是父最近一次 API 调用中发送的确切字符串。

**2. 工具定义。** Fork agent 定义声明 `tools: ['*']`，但将 `useExactTools` 标志设为 true，子直接接收父组装的工具数组。不过滤、不重新排序、不重新序列化。

**3. 对话历史。** 父与 API 交换的每条消息——用户轮次、assistant 轮次、工具调用、工具结果——通过 `forkContextMessages` 克隆到子的上下文。

**4. Thinking 配置和模型。** Fork 定义指定 `model: 'inherit'`，解析为父的确切模型。相同模型意味着相同 tokenizer、相同上下文窗口、相同缓存命名空间。

Fork agent 定义本身是最小化的——几乎是无操作。它指定所有工具（`'*'`）、继承父的模型、使用 bubble 模式用于权限（以便提示在父终端中浮现），并提供一个从未实际被调用的无操作 system prompt 函数——真正的 prompt 通过 override 通道到达，已渲染且逐字节稳定。

---

## 逐字节相同前缀技巧

对 Claude 的 API 请求有一个特定结构：system prompt，然后 tools，然后 messages。要使 prompt cache 命中，从请求开始到某个前缀边界的每个字节必须跨请求相同。

Fork agent 通过确保三个层级被冻结来实现此目标：

**第 1 层：System prompt 通过传递而非重新计算。**

当父 agent 的 system prompt 为其最后一次 API 调用渲染时，结果被捕获在 `toolUseContext.renderedSystemPrompt` 中。这是所有动态插值之后的字符串——GrowthBook feature flags、环境细节、MCP 服务器描述、skill 内容、CLAUDE.md 文件。Fork 子接收此确切字符串。

为什么不再调用 `getSystemPrompt()`？因为 system prompt 生成不是纯函数。GrowthBook flags 在 SDK 获取远程配置时从冷状态过渡到热状态。在父的第一轮返回 `false` 的 flag 可能在 fork 子启动时返回 `true`。如果 system prompt 包含由该 flag 门控的条件块，重新渲染的 prompt 即使一个字符也会发散。缓存破坏。80,000 token 全价重新处理，乘以五个子。

传递已渲染的字节消除了整个这类发散。

**第 2 层：工具定义通过精确传递。**

正常子 agent 经过 `resolveAgentTools()`，它基于 agent 定义的 `tools` 和 `disallowedTools` 数组过滤工具池，应用权限模式差异，并可能重新排序工具。结果的序列化工具数组将与父的不同——不同子集、不同顺序、不同权限注释。

Fork agent 完全跳过此步：

```typescript
const resolvedTools = useExactTools
  ? availableTools  // 父的确切数组
  : resolveAgentTools(agentDefinition, availableTools, isAsync).resolvedTools
```

`useExactTools` 标志仅在 fork 路径上设为 true。子获得父的工具池原样。相同工具、相同顺序、相同序列化。这包括在子的工具池中保留 Agent 工具本身，即使子被禁止使用它——移除它会改变工具数组并破坏缓存。

**第 3 层：消息数组构建。**

`buildForkedMessages()` 函数构建位于共享历史和每个子指令之间的最后两条消息。算法：

1. 克隆父的 assistant 消息（保留所有带有原始 ID 的 `tool_use` 块）。
2. 为每个 `tool_use` 块创建一个带有常量占位符字符串的 `tool_result`（跨所有子相同）。
3. 构建包含所有占位符结果的单条用户消息，后跟包装在 boilerplate 标签中的每个子指令。
4. 返回 `[clonedAssistantMessage, userMessageWithPlaceholdersAndDirective]`。

```typescript
// 伪代码——展示消息构建
function buildChildMessages(directive, parentAssistant) {
  const cloned = cloneMessage(parentAssistant)
  const placeholders = parentAssistant.toolUseBlocks.map(b =>
    toolResult(b.id, CONSTANT_PLACEHOLDER)  // 跨子逐字节相同
  )
  const userMsg = createUserMessage([...placeholders, wrapDirective(directive)])
  return [cloned, userMsg]
}
```

每个子的结果消息数组看起来像：

```
[...共享历史, assistant(所有 tool_uses), user(占位符结果..., 指令)]
```

指令之前的每个元素跨子相同。`FORK_PLACEHOLDER_RESULT`——一个常量字符串 `'Fork started -- processing in background'`——确保甚至工具结果块也是逐字节相同的。`tool_use_id` 值相同因为它们引用相同的 assistant 消息。只有最终文本块（包含每个子的指令）不同。

缓存边界正好落在最终文本块之前。其上的一切——潜在数万 token 的 system prompt、工具定义、对话历史和占位符结果——对第一个之后的每个子以 90% 折扣命中缓存。

---

## Fork Boilerplate 标签

每个子的指令被包装在服务于两个目的的 boilerplate XML 标签中：它指示子如何行为，并作为递归 fork 检测的标记。

Boilerplate 包含大约 10 条规则。关键的有：

- **覆盖父的 fork 指令。** 父的 system prompt 说"默认 fork"——boilerplate 显式告诉子："该指令是给父的。你就是 fork。不要生成子 agent。"
- **静默执行，一次报告。** 工具调用之间不输出对话文本。直接使用工具，然后产生结构化摘要。
- **保持在范围内。** 子不能超出其指令扩展。
- **结构化输出格式。** 响应必须遵循 Scope/Result/Key files/Files changed/Issues 模板，使结果在多个子同时报告时易于父解析。

规则 1 特别有趣。父的 system prompt——fork 子出于缓存原因逐字继承——包含像"当你有并行工作时默认 fork"的指令。如果子遵循该指令，它将尝试 fork 自己的子，创建无限递归 agent。Boilerplate 显式覆盖："该指令是给父的。你就是 fork。"

结构化输出格式（Scope/Result/Key files/Files changed/Issues）不是装饰性的。它将子的输出约束为事实报告，当五个子同时报告回来时，使结果更易于父解析和聚合。

---

## 递归 Fork 防护

Fork 子在其工具池中保留 Agent 工具。它必须如此——移除它会改变序列化的工具数组并破坏 prompt cache。但如果子实际调用不带 `subagent_type` 的 Agent 工具，fork 路径将再次触发，创建孙子 fork。此孙子将继承更大的上下文（父 + 子对话），生成自己的 fork，以此类推。

两个守卫防止此情况：

**主守卫：querySource 检查。** 当 fork 子生成时，其 `context.options.querySource` 设置为 `'agent:builtin:fork'`。`call()` 方法在允许 fork 路径前检查此值：

```typescript
// 在 AgentTool.call() 中：
if (effectiveType === undefined) {
  // Fork 路径——但我们已经在 fork 中了吗？
  if (querySource === 'agent:builtin:fork') {
    // 拒绝：已经是一个 fork 子
  }
}
```

这是快速路径。它检查选项对象中的单一字符串。

**后备守卫：消息扫描。** Fork 防护使用两个守卫：生成时设置的 `querySource` 标签（快速路径——单一字符串比较），以及扫描消息历史中的 boilerplate XML 标签的后备。后备存在是因为 `querySource` 在 autocompact 后仍存活，但在它未被正确传递的边缘情况下，消息扫描后备捕获递归。检查成本（扫描消息）与意外递归 fork 的成本（失控 API 支出）相比微不足道——这是一种双保险方法。

---

## 同步到异步过渡

Fork 子开始在前台运行：其消息流到父的终端，父阻塞等待完成。但如果子耗时太长怎么办？Claude Code 允许执行中途后台化——用户（或自动超时）可以将运行中的前台 agent 推入后台而不丢失任何工作。

机制出人意料地干净：

1. 当前台 agent 通过 `registerAgentForeground()` 注册时，创建后台信号 promise。

2. 父的同步循环在 agent 消息流和后台信号之间竞速：

```
while (true) {
  const result = await Promise.race([
    iterator.next(),         // agent 的下一条消息
    backgroundSignal,        // "移到后台"触发器
  ])
  if (result === BACKGROUND_SIGNAL) break
  // ... 处理消息
}
```

3. 当后台信号触发时，前台 iterator 通过 `iterator.return()` 优雅终止。这触发 generator 的 `finally` 块，处理清理。

4. 一个新的 `runAgent()` 实例以 `isAsync: true` 生成，使用相同的 agent ID 和迄今为止累积的消息历史。Agent 从离开的地方继续，现在在后台运行。

5. 原始同步 `call()` 返回 `{ status: 'async_launched' }`，父继续其对话。

没有工作丢失因为消息历史就是 agent 的状态。磁盘上的 sidechain 转录有 agent 产生的每条消息。新异步实例从此转录重放并从同步实例停止的地方继续。

---

## 自动后台化

当 `CLAUDE_AUTO_BACKGROUND_TASKS` 环境变量或 `tengu_auto_background_agents` GrowthBook flag 启用时，前台 agent 在 120 秒后自动后台化。禁用时，函数返回 0（无自动后台化）。

这是一个带有成本影响的 UX 决策。前台 agent 阻塞父终端——用户不能输入、不能发出新指令、不能生成其他 agent。两分钟足够 agent 同步完成大多数快速任务（其中流式输出是有用的反馈），但足够短以至于长时间运行的任务不会绑架终端。

在 fork 实验下，自动后台化问题没有意义：所有 fork 生成从一开始就强制异步。`run_in_background` 参数完全从 schema 中隐藏。每个 fork 子在后台运行，完成后通过 `<task-notification>` 报告，父从不阻塞。

---

## 何时不使用 Fork

Fork 是几种编排模式之一，在三种情况下被故意排除：

**协调器模式。** 协调器模式和 fork 模式是互斥的。协调器有结构化的委托模型：它维护计划、用显式 prompt 分配任务给工人、并追踪进度。Fork 的"继承一切"方法会破坏此模式。Fork 协调器将继承父协调器的 system prompt（其中说"你是协调器，委托工作"），子将尝试编排而非执行。`isForkSubagentEnabled()` 函数首先检查 `isCoordinatorMode()`，如果活跃则返回 false。

**非交互式会话。** SDK 和 API 消费者（`--print` 模式、Claude Agent SDK）在没有终端的情况下操作。Fork 的 `permissionMode: 'bubble'` 将权限提示浮现到父终端——在非交互式模式中不存在。与其构建单独的权限流，不如简单地禁用 fork 路径。SDK 消费者改为使用显式 `subagent_type` 选择。

**显式 subagent_type。** 当模型指定 `subagent_type`（例如 `"Explore"`、`"Plan"`、`"general-purpose"`）时，fork 路径不触发。Fork 仅在省略 `subagent_type` 时触发。这让模型可以在"我想要带有自己 system prompt 和工具集的专用 agent"（显式类型）和"我想要一个继承上下文的自身克隆来并行处理此事"（省略类型）之间选择。

---

## 经济学

考虑一个具体场景。开发者要求 Claude Code 重构一个模块。父 agent 分析代码库、形成计划，并并行分发五个 fork 子：一个更新数据库 schema、一个重写服务层、一个更新路由器、一个修复测试、一个更新类型。

此时在对话中，共享上下文是可观的：
- System prompt：~4,000 token
- 工具定义（40+ 工具）：~12,000 token
- 对话历史（分析 + 计划）：~30,000 token
- 带有五个 tool_use 块的 Assistant 消息：~2,000 token
- 占位符工具结果：~500 token

总共享前缀：约 48,500 token。每个子指令：约 200 token。

**不使用 fork**（五个独立 agent，各有全新上下文和自己 system prompt）：
- 每个子处理自己的 system prompt + 工具 + 任务 prompt
- 无缓存共享（不同 system prompt、不同工具集）
- 成本：5 倍完整输入处理

**使用 fork**（逐字节相同前缀）：
- 子 1：48,700 token 全价（首次请求缓存未命中）
- 子 2-5：48,500 token 以 10% 价格（缓存命中）+ 200 token 各全价
- 子 2-5 的有效成本：约 4,850 + 200 = 约 5,050 token 等效每个

节省随上下文大小和子数量增长。对于一个带有 100K token 历史并生成 8 个并行 fork 的热会话，缓存节省可超过不共享时输入 token 成本的 90%。

这就是为什么 fork 系统中的每个设计决策——传递而非重新计算、精确工具传递、占位符结果、甚至尽管被禁止仍在子工具池中保留 Agent 工具——为了一件事优化：逐字节相同前缀。每个决策用少量优雅或安全换取 API 成本的可衡量降低。

---

## 设计张力

Fork 系统做出了值得理解的显式权衡：

**隔离 vs. 缓存效率。** Fork 子继承一切，包括可能与其任务无关的对话历史。重写测试的子不需要父讨论数据库 schema 设计的 15 条消息。但包含这些消息是使前缀相同的原因。剥离无关历史将以破坏缓存为代价节省上下文窗口空间。设计赌注是缓存节省超过上下文开销。

**安全 vs. 缓存效率。** Agent 工具留在 fork 子的工具池中，即使子不能使用它。移除它更安全（子甚至无法尝试 fork），但会改变工具数组序列化。Boilerplate 标签和递归 fork 守卫是补偿控制——运行时防护而非静态移除。

**简单性 vs. 缓存效率。** 占位符工具结果是一个谎言。子看到父 assistant 消息中每个 tool_use 块的 `'Fork started -- processing in background'`，无论那些工具调用实际做了什么。这没问题因为子的指令告诉它做什么——它不需要父分发轮次的准确工具结果。但这意味着子的对话历史在技术上是前后不一致的。占位符是为简洁性和统一性而选择的，不是准确性。

这些权衡中的每一个反映了相同的优先级：当你按 token 为规模化 API 调用付费时，逐字节相同前缀值得扭曲架构以适应。

---

## Apply This：为 Prompt Cache 效率设计

Fork agent 模式适用于超出 Claude Code 的范围。任何从相同上下文分发多个并行 LLM 调用的系统都可以从缓存感知请求构建中受益。原则：

**1. 传递已渲染 prompt，不重新计算。** 如果你的 system prompt 包含任何动态内容——feature flags、时间戳、用户偏好、A/B 测试变体——捕获渲染结果并传值给子。重新计算有发散风险。

**2. 冻结工具数组。** 如果你的子需要不同工具集，你正在工具块上放弃缓存共享。考虑保留完整工具集并使用运行时守卫（像 fork boilerplate 的"不要使用 Agent"）而非编译时移除。

**3. 最大化共享前缀，最小化每个子后缀。** 构建你的消息数组使共享的一切在前、每个子内容追加在末尾。交错共享和每个子内容会碎片化缓存边界。

**4. 对可变内容使用常量占位符。** 当消息结构要求对先前工具调用的响应时，使用跨所有子相同的占位符字符串而非实际（发散的）结果。

**5. 计算盈亏平衡。** 缓存共享有开销：每个子更大的上下文窗口（它们携带无关历史）、运行时守卫而非静态安全、架构复杂性。计算你的并行模式（多少子、共享前缀多大）在考虑额外上下文 token 后是否实际节省了金钱。

Fork agent 系统，在其核心，是一个 prompt cache 利用引擎。它回答了每个多 agent 系统构建者最终面临的问题：当缓存给重复前缀 90% 折扣时，你愿意重构你的架构多远来申领该折扣？Claude Code 的回答是：非常远。
