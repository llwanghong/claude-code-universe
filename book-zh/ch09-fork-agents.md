# 第 9 章：Fork Agent 与 Prompt Cache

## 百分之九十五的洞察

当父 agent 并行生成五个子 agent 时，每个子 agent API 请求的绝大多数内容是相同的。System prompt 相同。工具定义相同。对话历史相同。触发生成的 assistant 消息相同。唯一不同的是最终指令："你处理数据库迁移"、"你写测试"、"你更新文档"。

在一个典型的热会话中，共享前缀可能有 80,000 token。每个子 agent 的指令可能只有 200 token。那是 99.75% 的重叠。Anthropic 的 prompt cache 对缓存的输入 token 给予 90% 的折扣。如果你能让子 agent 2 到 5 的那 80,000 token 命中缓存，你刚刚把那四次请求的输入成本削减了 90%。对于父 agent 来说，这是在同一并行分发上花费 $4 与花费 $0.50 的区别。

关键在于 prompt caching 是逐字节精确的。不是"足够相似"、不是"语义等价"。字节必须匹配，一个字符一个字符地，从 system prompt 的第一个字节到每个子 agent 内容分叉前的最后一个字节。一个多余的空格、一个重新排序的工具定义、一个过时的 feature flag 改变了一个 system prompt 片段——缓存就未命中。整个前缀以全价重新处理。

Fork agent 是 Claude Code 对这个约束的回答。它们不仅仅是"用上下文生成子 agent"的便利——它们是伪装成编排功能的 prompt cache 利用机制。Fork 系统中的每一个设计决策都追溯到一个问题：我们如何保证跨并行子 agent 的逐字节相同前缀？

---

## Fork 子 Agent 继承什么

Fork agent 从它的父 agent 继承四样东西，而且是按引用或逐字节精确复制继承的，不是重新计算。

**1. System prompt。** 不重新生成——直接传递。父 agent 已经渲染好的 system prompt 字节通过 `override.systemPrompt` 传递，从 `toolUseContext.renderedSystemPrompt` 获取。这就是父 agent 最近一次 API 调用中发送的确切字符串。

**2. 工具定义。** Fork agent 定义声明 `tools: ['*']`，但 `useExactTools` 标志设为 true，子 agent 直接接收父 agent 组装好的工具数组。不过滤、不重新排序、不重新序列化。

**3. 对话历史。** 父 agent 与 API 交换过的每条消息——用户轮次、assistant 轮次、工具调用、工具结果——都通过 `forkContextMessages` 克隆到子 agent 的上下文中。

**4. Thinking 配置和模型。** Fork 定义指定 `model: 'inherit'`，解析为父 agent 的确切模型。相同模型意味着相同的 tokenizer、相同的上下文窗口、相同的缓存命名空间。

---

## 逐字节相同前缀技巧

向 Claude 发出的 API 请求有特定结构：system prompt，然后是 tools，然后是 messages。要让 prompt cache 命中，从请求开始到某个前缀边界的每个字节必须跨请求完全相同。

Fork agent 通过确保三个层面被冻结来实现这一点：

**第 1 层：System prompt 通过传递而不是重新计算。**

为什么不能直接再次调用 `getSystemPrompt()`？因为 system prompt 生成不是纯函数。GrowthBook feature flags 在 SDK 获取远程配置时从冷状态过渡到热状态。一个在父 agent 第一轮返回 `false` 的标志可能在 fork 子 agent 启动时返回 `true`。如果 system prompt 包含一个由该 flag 门控的条件块，重新渲染的 prompt 哪怕差一个字符都会偏离。缓存破坏。80,000 token 全价重新处理，乘以五个子 agent。

**第 2 层：工具定义通过精确透传。** Fork agent 完全跳过工具解析——子 agent 原样获得父 agent 的工具池。相同的工具、相同的顺序、相同的序列化。这包括在子 agent 的工具池中保留 Agent 工具本身，即使子 agent 被禁止使用它——移除它会改变工具数组并破坏缓存。

**第 3 层：消息数组构造。** `buildForkedMessages()` 构造位于共享历史和每个子 agent 指令之间的最后两条消息：

```typescript
// Pseudocode — illustrates the message construction
function buildChildMessages(directive, parentAssistant) {
  const cloned = cloneMessage(parentAssistant)
  const placeholders = parentAssistant.toolUseBlocks.map(b =>
    toolResult(b.id, CONSTANT_PLACEHOLDER)  // Byte-identical across children
  )
  const userMsg = createUserMessage([...placeholders, wrapDirective(directive)])
  return [cloned, userMsg]
}
```

结果每个子 agent 的消息数组看起来像：

```
[...共享历史, assistant(所有 tool_use), user(占位符结果..., 指令)]
```

指令之前的每个元素跨子 agent 完全相同。`FORK_PLACEHOLDER_RESULT`——一个常量字符串 `'Fork started -- processing in background'`——确保即使工具结果块也是逐字节相同的。只有最终文本块（包含每个子 agent 的指令）有变化。

缓存边界正好落在那个最终文本块之前。它上面的所有内容——可能数万 token 的 system prompt、工具定义、对话历史和占位符结果——对第一个之后的每个子 agent 以 90% 的折扣命中缓存。

---

## Fork Boilerplate 标签

每个子 agent 的指令被包裹在一个大约 10 条规则的 boilerplate XML 标签中。关键规则：覆盖父 agent 的 fork 指令（"那条指令是给父 agent 的。你*就是* fork。不要生成子 agent。"）、静默执行并报告一次、保持在范围内、以及遵循结构化输出格式（Scope/Result/Key files/Files changed/Issues）。

---

## 递归 Fork 防止

Fork 子 agent 在其工具池中保留了 Agent 工具。它不得不这样做——移除它会改变序列化的工具数组并破坏 prompt cache。两条守卫防止递归 fork：

**主要守卫：querySource 检查。** 当 fork 子 agent 生成时，其 `context.options.querySource` 设置为 `'agent:builtin:fork'`。`call()` 方法在允许 fork 路径之前检查这个值——如果已经是 fork 了，就拒绝。

**后备守卫：消息扫描。** 扫描消息历史中是否存在 boilerplate XML 标签。如果 `querySource` 在 autocompact 等边缘情况下丢失了，这个后备守卫会捕获递归。

---

## Sync-to-Async 过渡

Fork 子 agent 在前台开始运行，但如果耗时太长（>120 秒）可以中途转为后台。机制是干净的：父 agent 的同步循环在"下一条 agent 消息"和"后台信号"之间 `Promise.race`。当后台信号触发时，前台 iterator 被优雅终止，一个新的 `runAgent()` 实例以相同的 ID 和累积的消息历史在后台生成。没有工作丢失。

---

## 经济学

一个具体场景。开发者要求 Claude Code 重构一个模块。父 agent 在对话历史中累积了约 48,500 token 的共享前缀。它并行分发 5 个 fork 子 agent：

- 不 fork：5 × 全价输入处理
- 使用 fork：子 agent 1 全价（48,700 token），子 agent 2-5 共享前缀 90% 折扣
- 有效节省：对子 agent 2-5，约 4,850 + 200 = ~5,050 等效 token 每个，vs 没有共享时的 48,700

**这就是为什么 fork 系统中的每个设计决策——传递而不是重新计算、精确工具透传、占位符结果、即使在子 agent 的工具池中保留 Agent 工具尽管被禁止——都优化一个目标：逐字节相同前缀。每个决策用少量优雅或安全性换取 API 成本的可衡量减少。**

---

## Apply This

**传递已渲染的 prompt，不要重新计算。** 如果你的 system prompt 包含任何动态内容——feature flags、时间戳、用户偏好、A/B 测试变体——捕获渲染结果并按值传递给子进程。重新计算可能导致分叉。

**冻结工具数组。** 如果你的子进程需要不同的工具集，你就在工具块上放弃了缓存共享。考虑保留完整工具集并使用运行时守卫而不是编译时移除。

**最大化共享前缀，最小化每个子进程的后缀。** 结构你的消息数组使所有共享的内容在前面，每个子进程的内容追加在末尾。交错共享和每个子进程的内容会碎片化缓存边界。

**对可变内容使用常量占位符。** 当消息结构需要先前工具调用的响应时，使用跨所有子进程相同的占位符字符串。

**计算盈亏平衡点。** 缓存共享有开销：每个子进程更大的上下文窗口、运行时守卫而不是静态安全、架构复杂性。计算你的并行模式在计入额外上下文 token 后是否真的省钱。
