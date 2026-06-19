# 第 4 章：与 Claude 对话 — API 层

## 不只是 `fetch()`

API 层处理配置到流式 HTTP 请求的转换。在 Claude Code 的规模下——数十万开发者、每秒多次请求——它需要处理认证、模型选择、prompt 缓存、流式、错误恢复和跨多个 provider 的后备。

## 多 Provider 客户端

系统不直接调用 Anthropic API。它通过一个支持多个 provider 的抽象层路由：

- Anthropic（主要）：通过 API key 或 OAuth 凭证
- Amazon Bedrock：用于 AWS 客户，具有不同的认证和 streaming 语义
- 未来：Google Vertex

provider 选择在启动时通过凭证和环境变量解决，并在每个模型的基础上选择客户端。

## Prompt Cache

Prompt caching 将处理上下文的成本降低 90%。使其有效需要仔细的 prompt 构造：

**稳定内容在前。** System prompt、工具定义、memory 上下文——这些在请求之间不会改变——放在请求的*开头*。API 缓存此前缀。

**易变内容在后。** 对话历史——随每次轮次增长——放在请求的*结尾*。这部分不会被缓存，但它代表的 token 更少。

### Cache 稳定性

改变*任何字节*于缓存前缀会无效化缓存。这意味着：
- Beta headers 必须在整个会话中保持不变（sticky latches）
- 工具定义顺序在重启之间必须保持稳定
- System prompt 生成必须对相同输入产生相同的输出

## 流式

流式是一个架构选择，而不仅仅是 UX 优化。模型可能在任何时候超时、出错或切换后备。一个非流式 API 调用可能花费 30 秒然后返回错误。流式允许系统半途检测问题，在 token 中间启动恢复，并在用户仍在观看时开始下一个操作。

## Slot Reservation

一个巧妙的成本优化：默认输出 tokens 上限为 8K。如果模型命中该上限，系统在后续请求中升级到 64K。这在 99% 的请求中节省了上下文——大多数响应适合 8K，没必要为不需要的东西预留空间。

## 错误恢复

API 层处理几类错误：
- **网络错误**：带指数退避的重试
- **模型不可用**：回退到后备模型
- **Prompt 太长**：触发上下文压缩 + 重试
- **Max output tokens**：升级 slot 并重试（最多 3 次）

## Apply This

1. **Prompt cache 稳定性是一个架构关注点，而非优化。** 系统提示和工具定义中的字节顺序很重要。保持稳定内容在前，易变内容在后。
2. **流式用于容错，不仅仅用于 UX。** 流式让你在半个响应中检测问题。对于长时间的 agentic 轮次，这不只是 UX——它是可靠性。
3. **Slot reservation：预留少，按需升级。** 在 99% 的情况下预留 8K 输出上限，在需要时升级到 64K。不要为你不使用的容量付费。
4. **抽象化 Provider。** API 层应该让 Anthropic、Bedrock、Vertex 看起来相同。Provider 特有的逻辑存在于一层中。
5. **处理错误，不要传播它们。** API 层应该尽可能恢复——重试、回退到后备模型、触发压缩——在向 agent loop 暴露错误之前。
