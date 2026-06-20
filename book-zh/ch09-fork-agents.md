# 第 9 章：Fork Agent 与 Prompt Cache

## Cache 共享的问题

当父 agent 生成一个子 agent 时，子 agent 从空对话开始。这意味着子 agent 必须处理其整个上下文——system prompt、工具定义、任务描述——全部从头开始。对于只做 50 个 token 工作的简短子 agent，这是 10,000+ 个被浪费的输入 token。

Fork agent 解决了这个问题。

## Fork 机制

Fork agent 不从空历史开始，而是*继承父 agent 的完整对话*作为其 context window 中的前缀。因为此前缀是逐字节相同的（相同的消息、相同的 system prompt、相同的工具 schema），API 的 prompt cache 精确命中。子 agent 继承了父 agent 的缓存，这意味着它只为自己的新 token 付费。

节省是巨大的：缓存前缀上的输入 token 约 90% 折扣。这使得为小任务生成 agent 在经济上可行——后台 memory 提取、代码审查通行、验证检查。

> 💡 **译注**：为什么要关心"90% 折扣"？因为子 agent 每次启动都要把 system prompt、工具定义等重新发送给 API。如果父 agent 的对话已经有 10,000 token 的上下文，不 fork 的话子 agent 需要为这 10,000 token 支付全价。fork 之后，API 识别出"这部分跟父 agent 的前缀一模一样"，只对子 agent 自己新产生的 token 收费。算一笔账：父 agent 每轮对话后自动触发后台 memory 提取子 agent，每天发生数百次。如果没有 fork，每次花 $0.03；有 fork 后每次花 $0.003。一天省 $27，一个月省 $810。对于数十万用户的规模，这是年化百万美元级别的节省。

## 工作原理

Fork 不是通过复制消息来工作的。它通过使子 agent 的初始上下文与父 agent 的逐字节相同来工作。子 agent 的 `query()` 调用以与父 agent 相同的前缀消息开始——相同的 system prompt，相同的对话历史（直到 fork 点），相同的工具定义，相同的 beta headers。

当 API 接收子 agent 的请求时，它将此前缀识别为缓存命中。只有子 agent 附加到此前缀之后的新 token 才按全价计费。节省是立竿见影的。

```typescript
// Pseudocode — fork agent setup
function createForkedContext(parentContext) {
  return {
    ...parentContext,
    // Share the parent's frozen system prompt (no re-rendering)
    renderedSystemPrompt: parentContext.renderedSystemPrompt,
    // Inherit the parent's full message history as prefix
    messages: parentContext.messages,
    // Byte-identical prefix = cache hit
  }
}
```

`renderedSystemPrompt` 被冻结以防止重新渲染——重新渲染可能因 feature flag 预热而发散，产生不同的字节，并破坏整个缓存。

## 它何时被使用

Fork 机制被触发于：
- 后台 memory 提取 agent（在每个查询循环轮次后运行）
- 压缩 agent（需要在不丢失细节的情况下总结对话）
- 协调器 worker agent（继承协调器对问题的理解）
- 当父 agent 的上下文已经包含子 agent 完成其工作所需的大部分信息时的任何场景

## 权衡

Fork 不是免费的。子 agent 继承了父 agent 的完整上下文，这比精简摘要大得多。如果子 agent 不需要 90% 的父上下文，让它处理所有这些 token 是一种浪费——即使打了九折。

引擎判断是在继承缓存前缀的成本和精简摘要的收益之间：缓存节省的 token 是否大于处理不相关上下文的成本？当父 agent 的对话长于几百个 token 时，fork 几乎总是胜出。

## 缓存失效

当父 agent 的对话发生变化时（新的消息被追加），缓存的子 agent 响应就不再有效——后续的 API 调用不会有相同的逐字节前缀。系统通过为每个 fork 分配唯一 ID 并在上下文变化时跟踪哪些 fork 仍然有效来处理此问题。在子 agent 执行之前，系统检查其 fork 是否仍然有效。如果不是，子 agent 回退到标准生成。

## Apply This

**当子操作共享上下文时，共享 cache。** 如果子 agent 继承了父 agent 的完整对话，prompt cache 可以节省 90%。Fork 使这成为可能。

**冻结共享的上下文。** 不要重新渲染或重新计算子 agent 将与被继承父级共享的任何内容。一个字节的差异就会破坏整个缓存。`renderedSystemPrompt` 被冻结是有原因的。

**仅在节省超过成本时 Fork。** 如果子 agent 不需要父上下文的 90%，继承它的开销可能会超过缓存节省。做算术。当父对话长于几百个 token 时，fork 几乎总是胜出。

**跟踪缓存有效性。** 当父上下文变化时，使依赖的 fork 无效。不要让 agent 使用过时的缓存——后续 API 调用不会有缓存命中。

**Fork 使频繁的小型子 agent 经济可行。** 没有它，为每次 memory 提取或快速验证生成一个新 agent 太昂贵。有了它，它们是每个轮次之后的标准。
