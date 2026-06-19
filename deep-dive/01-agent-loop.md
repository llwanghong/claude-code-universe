# 模块 0+1：Agent 的本质 + Agent Loop

## 模块 0：Agent 的本质 — 你造的是载具，不是驾驶者

### 核心论点

```
模型做决策。          Harness 执行。
模型做推理。          Harness 提供上下文。
模型是驾驶者。        Harness 是载具。
```

Agency — 感知、推理、行动的能力 — 来自模型训练，不是来自外部代码的编排。Harness 工程师的工作不是造智能，而是给智能提供可以操作的环境。

```
Harness = Tools + Knowledge + Observation + Action Interfaces + Permissions
```

### Claude Code 的三层架构

从 `sdk-tools.d.ts`（2720行类型定义）可以看到完整的 22 个工具：

```
Agent, Bash, TaskOutput, ExitPlanMode, FileEdit, FileRead, FileWrite,
Glob, Grep, TaskStop, ListMcpResources, Mcp, NotebookEdit, ReadMcpResource,
TodoWrite, WebFetch, WebSearch, AskUserQuestion, Config, EnterWorktree, ExitWorktree
```

生产源码的分层：

```
┌────────────────────────────────────────────────────┐
│  Layer 1: 输入/输出 Schema (sdk-tools.d.ts)          │
│  ├─ 22 个工具的精确定义                               │
│  └─ 类型安全的契约：模型知道能做什么，Harness 知道如何执行  │
├────────────────────────────────────────────────────┤
│  Layer 2: Agent Loop (query.ts, 1729行)             │
│  ├─ while stop_reason == "tool_use"                 │
│  ├─ 执行前 hook: 权限校验、沙箱隔离                     │
│  ├─ 执行后 hook: 结果截断、上下文压缩                    │
│  └─ 生命周期: session → compaction → resume           │
├────────────────────────────────────────────────────┤
│  Layer 3: 基础设施 (vendor/)                          │
│  ├─ ripgrep: 高性能代码搜索                            │
│  ├─ audio-capture: 语音输入                           │
│  └─ sharp: 图片处理 (PNG/PDF 渲染)                     │
└────────────────────────────────────────────────────┘
```

---

## 模块 1：Agent Loop — 一个循环统治一切

### 教学版核心（s01_agent_loop.py，120行）

```python
def agent_loop(messages: list):
    while True:
        # Step 1: 把消息和工具定义发给模型
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        # Step 2: 追加助手回复
        messages.append({"role": "assistant", "content": response.content})
        # Step 3: 检查退出条件 — 模型不调工具了就结束
        if response.stop_reason != "tool_use":
            return
        # Step 4: 执行每个工具调用，收集结果
        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = run_bash(block.input["command"])
                results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": output
                })
        # Step 5: 把工具结果作为 user 消息追加，回到 Step 1
        messages.append({"role": "user", "content": results})
```

### 五个关键设计决策

1. **stop_reason 是唯一的退出条件** — 模型自己决定什么时候完成任务
2. **工具结果以 user 角色回灌** — Anthropic API 的约定
3. **只给 Bash 一个工具** — 给模型通用工具比给 50 个专用工具更好
4. **危险命令黑名单** — Harness 安全的第一道防线
5. **输出截断（50K字符）** — 管理模型的注意力

### 生产版（query.ts:307-560）

生产版的 while 循环体约 1200 行。执行顺序：

```
Before LLM Call:
├─ applyToolResultBudget()     — 工具结果大小预算
├─ snipCompactIfNeeded()       — 历史消息裁剪
├─ microcompact()              — 微压缩
├─ contextCollapse()           — 上下文折叠（实验性）
├─ autocompact()               — 自动压缩 + LLM 摘要
└─ build system prompt         — 组装 system prompt

LLM Call (流式):
├─ prependUserContext()        — 注入用户上下文
├─ deps.callModel({...})       — 调用模型（支持 fallback 重试）
└─ 逐 token 处理响应

After LLM Call:
├─ 检查 needsFollowUp          — 是否有 tool_use block
├─ 执行工具 (streaming/并行)     — runTools()
├─ append tool results         — 回灌结果
└─ continue 或 return          — 回到 while(true) 或返回结果
```

### 复杂度分布

多出来的 ~1200 行分布：
- 65% 上下文管理（压缩、折叠、裁剪、预算）
- 15% 错误恢复（max_tokens 恢复、fallback 模型切换）
- 10% 流式工具执行（StreamingToolExecutor）
- 5% 权限和 Hook
- 5% 分析遥测

### 前端启示

1. **Agent Loop 本身不是壁垒，上下文管理才是** — 花 30 分钟就能写出 Agent Loop，但能写出五层压缩流水线的才是真正的 Harness 工程师
2. **工具设计应该从少开始** — 从 1 个通用工具开始，抽象程度不够时再加
3. **输出截断是必要的恶** — 不要让一个工具调用返回 10MB JSON
4. **权限控制在调用前，不在调用后** — 在执行前拦截，不是做了再让用户撤销
5. **流式不只是为了 UX，是为了容错** — fallback 换模型重试需要流式架构

---

### 对照表

| 维度 | 教学版 (120行) | 生产版 (1729行) |
|------|---------------|-----------------|
| 上下文管理 | 没有 | 5 层压缩流水线 |
| 流式处理 | 同步等全部响应 | 逐 token 处理 |
| 错误恢复 | 没有 | fallback 模型重试 |
| 权限控制 | 黑名单数组 | 完整权限系统 |
| Token 预算 | 没有 | task_budget 跨 compaction 追踪 |
| Hook 系统 | 没有 | pre/post sampling hooks |
