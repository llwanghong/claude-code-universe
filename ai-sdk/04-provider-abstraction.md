# Provider 抽象 — 一次编写，多模型运行

## Claude Code 怎么做

Claude Code 通过 Anthropic SDK 的多 provider 包装类支持 Direct API / Bedrock / Vertex / Azure：

```typescript
// Claude Code — 启动时选择 provider，之后透明
const client = getAnthropicClient()  // 根据环境变量选择 provider
// Agent loop 从不检查用哪个 provider
```

但只支持 Anthropic 模型。GPT-4o、Gemini、Mistral 无法使用。

## AI SDK 怎么做

```typescript
// AI SDK — 导入不同 provider，API 完全一致
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'

// 三行代码，三个模型，完全相同的 API
const gpt = await generateText({ model: openai('gpt-4o'), prompt: '...' })
const claude = await generateText({ model: anthropic('claude-sonnet-4-6'), prompt: '...' })
const gemini = await generateText({ model: google('gemini-2.5-pro'), prompt: '...' })
```

70+ providers：OpenAI、Anthropic、Google、Mistral、Cohere、DeepSeek 以及 Amazon Bedrock、Azure、Groq、Fireworks 等云 provider。

## 两种抽象方式的对比

| 维度 | Claude Code | AI SDK |
|------|------------|--------|
| 模型提供商 | Anthropic only | 70+ providers |
| 切换成本 | 零（配置变更） | 零（import 变更） |
| 多模型混合 | 不支持 | 原生支持 |
| 模型路由 | 手动配置 | `prepareStep` 中换模型 |
| 工具兼容性 | Anthropic 原生 | 跨所有 provider |

## Provider 抽象的实现

AI SDK 通过 `@ai-sdk/provider` 包定义语言模型的统一接口。每个 provider 包实现该接口，将 provider 特有的 API 翻译成统一格式。

核心接口：

```typescript
interface LanguageModelV4 {
  specificationVersion: 'v4'
  provider: string
  modelId: string

  doGenerate(options: GenerateOptions): Promise<GenerateResult>
  doStream(options: StreamOptions): Promise<StreamResult>
}
```

## 模型路由

AI SDK 支持在 agent loop 内部切换模型：

```typescript
const result = await generateText({
  model: openai('gpt-4o'),  // 默认模型
  prepareStep: async ({ stepNumber }) => {
    // 复杂步骤切换到更强模型
    if (stepNumber > 3) {
      return { model: anthropic('claude-sonnet-4-6') }
    }
    // 简单步骤切换到更便宜模型
    if (stepNumber === 1 && isSimpleQuery) {
      return { model: openai('gpt-4o-mini') }
    }
  },
})
```

Claude Code 在模型选择上更简单：整个会话使用一个主循环模型（可能有一个 fallback 模型用于错误恢复）。

## 前端启示

**Provider 抽象让你不锁定单一模型供应商。** 构建 AI 产品时，先用最便宜/最快的模型做原型。当用户需要更好质量时切换到更强的模型。Provider 抽象让这个切换是代码一行 import 变更。

**模型路由是成本优化的关键。** 70-80% 的用户查询可以用便宜模型（GPT-4o-mini、Haiku）处理。昂贵的模型（Opus、GPT-5）只用于复杂查询。`prepareStep` 让你在 agent loop 内部根据复杂度换模型。

**不要因为 Claude Code 用 Anthropic 就限制自己。** AI SDK 让你在前端产品中同时使用 Anthropic（推理能力强）和 OpenAI（工具生态丰富）和 Google（多模态好）。每种模型有各自的优势。
