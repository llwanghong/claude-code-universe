# 模块 13：Full Agent — 完整全景图

## 教学版：s_full.py（740行）

所有机制的组合：

```
┌──────────────────────────────────────────────────────────┐
│                    FULL AGENT                             │
│                                                           │
│  System prompt (s05 skills + task-first + todo nag)      │
│                                                           │
│  Before each LLM call:                                    │
│  +──────────────────+ +──────────────+ +──────────────+  │
│  | Microcompact (s06)| | Drain bg (s08)| |Check inbox  |  │
│  | Auto-compact (s06)| | notifications | |(s09)         |  │
│  +──────────────────+ +──────────────+ +──────────────+  │
│                                                           │
│  Tool dispatch: 20+ tools                                 │
│  Subagent (s04) + Teammate (s09) + Shutdown (s10)        │
│  Plan gate (s10) + Autonomous (s11)                       │
└──────────────────────────────────────────────────────────┘
```

## 生产版：1902 个源文件的完整架构

### 顶层结构

```
claude-code-src/
├── main.tsx                 # 入口
├── query.ts (1729行)        # 🔥 核心 Agent Loop
├── Tool.ts (792行)          # 🔥 工具系统
├── context.ts (189行)       # 上下文管理
├── tasks.ts (39行)          # 持久化任务入口
├── tools.ts (389行)         # 工具注册表
├── commands.ts              # 命令系统
├── history.ts               # 历史记录
├── cost-tracker.ts          # 成本追踪
├── QueryEngine.ts           # 查询引擎
├── Task.ts                  # Task 基类
├── setup.ts                 # 初始化
│
├── assistant/               # 会话历史
│   └── sessionHistory.ts
│
├── bootstrap/               # 启动引导
│   └── state.ts             # 全局状态
│
├── bridge/                  # IDE 桥接
├── buddy/                   # 协作功能
│
├── cli/                     # CLI 界面
│   ├── handlers/            # 输入处理器
│   └── transports/          # 传输层
│
├── commands/ (87个文件)     # 所有 slash 命令
│   ├── compact/ clear/ config/ cost/
│   ├── help/ hooks/ ide/ issue/
│   ├── login/ logout/ mcp/ memory/ model/
│   ├── permissions/ plan/ plugin/ review/
│   ├── agents/ branch/ diff/ doctor/
│   └── ... (65+ more)
│
├── components/ (51个文件)   # React UI 组件
│
├── context/                 # 上下文 UI
│   ├── mailbox.tsx          # Agent 收件箱 UI
│   ├── notifications.tsx    # 通知 UI
│   └── ...                  # 其他上下文组件
│
├── coordinator/             # 协调器
├── entrypoints/             # SDK 入口类型
│   ├── agentSdkTypes.ts
│   ├── sdk/coreTypes.ts
│   └── sandboxTypes.ts
│
├── hooks/ (4个文件)         # Hook 系统
├── ink/ (6个文件)           # Ink 渲染引擎
├── keybindings/             # 键盘绑定
├── migrations/              # 数据迁移
├── native-ts/ (4个文件)     # 原生模块
├── plugins/ (2个文件)       # 插件系统
├── query/                   # Query 子模块
│   ├── config.ts            # 查询配置
│   ├── deps.ts              # 依赖注入
│   ├── transitions.ts       # 状态转换
│   ├── tokenBudget.ts       # Token 预算
│   └── stopHooks.ts         # 停止 hooks
│
├── screens/                 # 屏幕渲染
├── server/                  # HTTP 服务器
│
├── services/ (21个模块)     # 服务层
│   ├── compact/ (11文件)    # 🔥 压缩流水线
│   ├── mcp/                 # MCP Client/Server
│   ├── analytics/           # 分析遥测
│   ├── api/                 # API 调用/重试
│   ├── oauth/               # OAuth 认证
│   ├── toolUseSummary/      # 工具使用摘要
│   ├── skillSearch/         # Skill 语义搜索
│   ├── contextCollapse/     # 上下文折叠
│   ├── sessionTranscript/   # 会话转录
│   └── ...                  # 其他服务
│
├── skills/ (2个文件)        # Skill 系统
├── state/                   # 应用状态
│
├── tasks/ (9个模块)         # 任务系统
│   ├── LocalAgentTask/
│   ├── LocalShellTask/ (117行)
│   ├── RemoteAgentTask/
│   ├── InProcessTeammateTask/
│   ├── DreamTask/
│   └── ...
│
├── tools/ (44个工具目录)    # 🔥 工具实现
│   ├── AgentTool/ (15文件)
│   ├── BashTool/ (17文件)
│   ├── FileReadTool, FileWriteTool, FileEditTool/
│   ├── GrepTool, GlobTool/
│   ├── TodoWriteTool, TaskCreateTool, .../
│   ├── SkillTool, MCPTool, WebFetchTool, WebSearchTool/
│   ├── TeamCreateTool, TeamDeleteTool, SendMessageTool/
│   ├── ScheduleCronTool, EnterWorktreeTool, ExitWorktreeTool/
│   └── ...
│
├── types/ (11个模块)        # TypeScript 类型
│   ├── message.ts           # 消息类型
│   ├── permissions.ts       # 权限类型
│   ├── hooks.ts             # Hook 类型
│   ├── tools.ts             # 工具类型
│   └── ...
│
├── utils/ (36个模块)        # 工具函数
│   ├── messages/ (mappers.ts, systemInit.ts)
│   ├── bash/ (shell 解析/安全/沙箱)
│   ├── hooks/ (Hook 注册/执行)
│   ├── swarm/ (19文件)      # Agent 团队编排
│   ├── skills/              # Skill 变更检测
│   ├── permissions/         # 权限管理
│   ├── settings/            # 配置管理
│   ├── model/               # 模型选择
│   ├── memory/              # 记忆系统
│   ├── git/                 # Git 操作
│   └── ...                  # 其他工具函数
│
├── vendor/                  # 内置二进制
│   ├── ripgrep/             # 代码搜索
│   └── audio-capture/       # 语音输入
│
└── vim/ voice/              # Vim 模式 + 语音
```

### 完整的数据流

```
用户输入
  ↓
commands/ (slash command 解析)
  ↓
query() 入口
  ↓
┌─ Before Loop ────────────────────────────────┐
│ applyToolResultBudget → snip → microcompact  │
│ → contextCollapse → autocompact              │
│ → buildSystemPrompt                          │
│ → memory prefetch + skill prefetch            │
└──────────────────────────────────────────────┘
  ↓
┌─ LLM Call (流式) ───────────────────────────┐
│ deps.callModel({                             │
│   messages, systemPrompt, tools,             │
│   thinkingConfig, signal, options            │
│ })                                           │
│ → streaming response handling                │
│ → tool_use detection                         │
│ → needsFollowUp flag set                     │
└──────────────────────────────────────────────┘
  ↓
┌─ Tool Execution (并行) ──────────────────────┐
│ StreamingToolExecutor                        │
│ → canUseTool 权限检查                         │
│ → tool.call(input) 执行                      │
│ → post-sampling hooks                        │
│ → results → messages                         │
└──────────────────────────────────────────────┘
  ↓
continue → 回到 Before Loop
  或
return → 返回结果给用户
```

## 12 模块 → 5 大能力支柱

```
                教学版                    生产版
                ──────                   ──────
模块 0-1        Agent Loop (120行)  →    query.ts (1729行)
Loop 能力

模块 2-3        4 Tools + Todo       →    44 Tools + buildTool() + Zod
Tool 能力       

模块 4-5        Subagent + Skills    →    Agent Tool + Skill Prefetch + MCP
扩展能力        

模块 6-8        Compact + Tasks      →    5层压缩 + 8种Task + Background
记忆能力        

模块 9-12       Teams + Cron + WT    →    Swarm + 多Backend + Worktree Hooks
编排能力        
```

## 前端 AI 应用的 5 层架构

```
┌────────────────────────────────────────────────┐
│ Layer 5: Generative UI (Vercel AI SDK)         │
│   parts-based 渲染 · 流式输出 · 交互式工具卡片    │
│   对应能力: 模块 1-2 的工具执行 + 结果渲染          │
├────────────────────────────────────────────────┤
│ Layer 4: Agent Orchestration                  │
│   Subagent 分发 · Team 编排 · Workflow 系统      │
│   对应能力: 模块 4, 9-10                        │
├────────────────────────────────────────────────┤
│ Layer 3: Context & Memory                     │
│   压缩流水线 · 持久化任务 · Background Tasks     │
│   对应能力: 模块 5-8                            │
├────────────────────────────────────────────────┤
│ Layer 2: Tool System                          │
│   buildTool 模式 · Zod Schema · 权限控制         │
│   对应能力: 模块 2-3                            │
├────────────────────────────────────────────────┤
│ Layer 1: Agent Loop                           │
│   while tool_use · 流式处理 · 错误恢复            │
│   对应能力: 模块 0-1, 11-12                     │
└────────────────────────────────────────────────┘
```

## 三条成长路径

**路径 A — Harness 工程师**：深入 Claude Code 源码，理解每层压缩流水线的 trade-off，能自己设计 Agent 系统

**路径 B — AI-Native 产品工程师**：用 Vercel AI SDK + Claude Code 的设计模式，做出有生成式 UI 的商业产品

**路径 C — 基础设施工程师**：深入 MCP 协议、Worktree 隔离、Tool Builder 模式，打造团队级 AI 工具平台

## 关键设计原则

1. **Model drives, Harness executes** — 模型做决策，Harness 执行。不要把决策逻辑写死在代码里
2. **Start with one tool** — 从最小工具集开始，不够再加
3. **Compression is the hardest problem** — 上下文管理是 Agent 系统最复杂的部分
4. **Isolate by directory, coordinate by task ID** — 并行 Agent 的隔离原则
5. **State outside conversation** — 任何需要跨会话保留的状态，存在文件/数据库里，不在对话历史里
6. **Tools are contracts** — inputSchema + outputSchema + prompt = 完整工具契约
7. **Security at every layer** — 权限检查、沙箱、路径验证、命令注入防护，多层防御
