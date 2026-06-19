# S02：API 层与 Prompt Cache

> 对应：书 ch04 + ch09 | 源码：services/api/claude.ts

## Prompt Cache：90% 输入 Token 折扣

Prompt cache 是 Claude Code 成本经济的支柱。其核心原则：

**稳定内容在前，易变内容在后。** System prompt、工具定义、agent 指令——这些从不改变——放在每个 API 请求的*开头*。API 缓存此前缀。对话历史——每轮都在增长——放在*结尾*。

即使是一个字节的改变也会完全无效化缓存。因此有 sticky latches（会话期间 beta headers 永不改变）和确定性的 system prompt 生成。

## Slot Reservation

默认输出 tokens 上限为 8K。如果模型命中该上限，在后续请求中升级到 64K。在 99% 的请求中节省上下文——大多数响应适合 8K。

## Fork Agent 与 Cache 共享

Fork agent 从父 agent 继承完整的对话历史作为 context window 前缀。因为前缀是逐字节相同的，API 的 prompt cache 精确命中。子 agent 只为自己的新 token 付费——约 90% 的输入 token 折扣。

## 错误恢复

- 网络错误 → 带指数退避的重试
- 模型不可用 → 回退到后备模型
- Prompt 太长 → 触发上下文压缩 + 重试
- Max output tokens → 升级 slot 并重试（最多 3 次）

## 前端启示

1. **如果你的 AI 应用使用 prompt cache，将稳定内容放在前面，易变内容放在后面**
2. **Slots：预留少，按需升级。** 在 99% 的请求中节省上下文
3. **错误恢复应该在 API 层处理。** 重试、回退、压缩——全在 API 层。不要让 UI 看到原始 API 错误
4. **对于频繁的小型 AI 任务，共享缓存的方式值得投资。** 子 agent 不需要每次从头开始
5. **Sticky 配置。** API 版本、模型、beta headers——在会话开始时快照，永不改变
