# 模块 5+6：Skill Loading + Context Compaction

## 模块 5：Skill Loading — 按需加载领域知识

### 教学版（s05_skill_loading.py）

两层注入模式：
```
Layer 1 (cheap): skill names in system prompt (~100 tokens/skill)
Layer 2 (on demand): full skill body in tool_result

skills/
  pdf/SKILL.md      ← frontmatter (name, description) + body
  code-review/SKILL.md

System prompt:
  "Skills available: pdf (Process PDF), code-review (Review code)..."

When model calls load_skill("pdf"):
  tool_result = <skill> full PDF processing instructions </skill>
```

关键洞察：**Don't put everything in the system prompt. Load on demand.**

### 生产版（SkillTool）

源代码位置：`tools/SkillTool/SkillTool.ts`

生产版的增强：
- **Skill prefetch**（`query.ts:331`）：边流式输出边预取 skill，不阻塞模型
- **Skill change detector**（`utils/skills/skillChangeDetector.ts`）：检测 skill 文件变更
- **Experimental skill search**：基于语义搜索发现相关 skill

```typescript
// query.ts:331 — skill discovery 在流式过程中预取
const pendingSkillPrefetch = skillPrefetch?.startSkillDiscoveryPrefetch(
  null, messages, toolUseContext,
)
```

生产版的 skills 支持 frontmatter hooks：
- 每个 SKILL.md 可以有 frontmatter 定义 metadata
- 通过 `registerFrontmatterHooks` 注册到 hook 系统
- Skills 可以定义自己需要的工具、模型偏好

---

## 模块 6：Context Compaction — 无限会话的秘密

### 教学版（s06_context_compact.py）：三层压缩

```
Layer 1: micro_compact (静默，每轮执行)
  把 3 轮前的非 read_file 工具结果替换为 "[Previous: used {tool_name}]"

Layer 2: auto_compact (Token > 50000 触发)
  保存完整 transcript 到 .transcripts/
  → 让 LLM 总结 → 用总结替换全部消息

Layer 3: manual compact (模型主动调用 compact 工具)
  同 auto_compact，由模型自己判断时机
```

### 生产版：五层压缩流水线

```typescript
// query.ts:376-468 — 每轮 LLM 调用前执行完整的压缩流水线

Layer 1: applyToolResultBudget()    // 工具结果大小预算
  按每个工具 maxResultSizeChars 裁剪结果
  与 microcompact 正交组合（compact 按 ID 操作，budget 按大小操作）

Layer 2: snipCompactIfNeeded()      // 历史消息裁剪（实验性）
  裁剪掉旧的、不重要的消息

Layer 3: microcompact()             // 微压缩
  将旧 tool_result 替换为 "[Old tool result content cleared]"
  可压缩工具: FileRead, Shell, Grep, Glob, WebSearch, WebFetch, FileEdit, FileWrite
  不可压缩: 其他所有工具的结果永久保留

Layer 4: contextCollapse()          // 上下文折叠（实验性）
  读时投影（read-time projection），不修改 REPL 数组
  collapse 通过 commit log 持久化，跨轮次保留

Layer 5: autocompact()              // 自动压缩 + LLM 摘要
  触发条件: token 超阈值 + 非 compact/session_memory query
  流程: executePreCompactHooks → compactConversation → executePostCompactHooks
  circuit breaker: 连续失败时停止重试
```

### 生产版 compact 目录结构（11 个文件）

```
services/compact/
├── autoCompact.ts          # 自动压缩触发逻辑
├── compact.ts              # 压缩核心：调 fork agent 做摘要
├── microCompact.ts         # 微压缩
├── reactiveCompact.ts      # 响应式压缩（API 413 触发）
├── snipCompact.ts          # 历史裁剪
├── sessionMemoryCompact.ts # 会话记忆压缩
├── apiMicrocompact.ts      # API 层微压缩
├── grouping.ts             # 消息分组
├── timeBasedMCConfig.ts    # 基于时间的微压缩配置
├── compactWarningHook.ts   # 压缩警告 hook
├── compactWarningState.ts  # 压缩警告状态
└── postCompactCleanup.ts   # 压缩后清理
```

### compact.ts 的核心流程

```typescript
// compact.ts 中的 compactConversation()
export async function compactConversation(params) {
  // 1. 执行 pre-compact hooks
  await executePreCompactHooks(...)
  
  // 2. 分析上下文（token 用量、消息分布）
  const contextAnalysis = analyzeContext(...)
  
  // 3. 构建 compact prompt
  //    - 包含当前关键状态
  //    - 包含 attachment delta（文件变更、agent 列表变更等）
  
  // 4. 调用 fork agent 生成摘要
  const summary = await runForkedAgent({
    systemPrompt: COMPACT_PROMPT,
    messages: messagesToCompact,
    maxTokens: COMPACT_MAX_OUTPUT_TOKENS,  // 20K tokens
  })
  
  // 5. 执行 post-compact hooks
  await executePostCompactHooks(...)
  
  // 6. 返回 postCompactMessages（摘要 + attachment + hook results）
  return { summaryMessages, attachments, hookResults, ... }
}
```

## 前端启示

1. **知识注入 = 元数据先 + 内容按需**：不要把所有 RAG 结果塞进 system prompt
2. **压缩流水线应该正交化**：每层解决一个问题，互不依赖
3. **压缩后必须保留关键上下文**：
   - Read 工具的结果永久保留（因为它是参考材料）
   - 旧 shell 结果可以丢弃
4. **Circuit breaker 模式**：连续压缩失败 → 停止重试，防止死循环
5. **压缩是 Harness 工程师最重要的技能**：AI 应用的内存管理 = 上下文压缩策略
