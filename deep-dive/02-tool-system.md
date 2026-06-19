# 模块 2：Tool System — 从 dispatch map 到 44 个工具的工业级引擎

## 教学版：4 个工具 + 1 个 dispatch map（s02_tool_use.py）

```python
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"]),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
}

# 在 agent_loop 中：
for block in response.content:
    if block.type == "tool_use":
        handler = TOOL_HANDLERS.get(block.name)
        output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
```

## 生产版：buildTool 模式 + 44 个工具目录

每个工具都是独立目录：

```
tools/<ToolName>/
├── <ToolName>Tool.ts    # 核心实现（call, inputSchema, outputSchema）
├── prompt.ts             # 工具的 system prompt 描述
├── constants.ts          # 工具名常量
└── UI.tsx                # 工具的 UI 渲染
```

### 完整工具清单（44个）

| 类别 | 工具 | 目录 |
|------|------|------|
| 文件操作 | FileRead, FileWrite, FileEdit, Glob, Grep | tools/File*Tool/ |
| 命令执行 | Bash, PowerShell | tools/BashTool/, tools/PowerShellTool/ |
| Agent 管理 | Agent, TaskCreate, TaskUpdate, TaskList, TaskGet | tools/AgentTool/, tools/Task*Tool/ |
| 任务管理 | TaskOutput, TaskStop, TodoWrite | tools/Task*Tool/, tools/TodoWriteTool/ |
| 计划模式 | EnterPlanMode, ExitPlanMode | tools/EnterPlanModeTool/, tools/ExitPlanModeTool/ |
| 上下文 | Skill, Brief, Sleep | tools/SkillTool/, tools/BriefTool/ |
| 团队协作 | TeamCreate, TeamDelete, SendMessage | tools/Team*Tool/, tools/SendMessageTool/ |
| 网络 | WebFetch, WebSearch | tools/WebFetchTool/, tools/WebSearchTool/ |
| MCP | MCP, ListMcpResources, ReadMcpResource, McpAuth | tools/MCP*Tool/ |
| 用户交互 | AskUserQuestion, Config | tools/AskUserQuestionTool/, tools/ConfigTool/ |
| 隔离 | EnterWorktree, ExitWorktree | tools/EnterWorktreeTool/, tools/ExitWorktreeTool/ |
| 定时 | CronCreate, CronDelete, CronList | tools/ScheduleCronTool/ |
| 其他 | LSP, RemoteTrigger, REPL, NotebookEdit, ToolSearch, SyntheticOutput | tools/*Tool/ |

### buildTool 模式

```typescript
// Tool.ts 定义的工具构建器模式
export const SomeTool = buildTool({
  name: TOOL_NAME,
  searchHint: '...',
  maxResultSizeChars: 100_000,
  async description() { return '...' },
  async prompt() { return '...' },
  get inputSchema() { return inputSchema() },    // Zod schema
  get outputSchema() { return outputSchema() },  // Zod schema
  shouldDefer: true,
  async call(input) { /* 执行逻辑 */ },
  renderToolUseMessage,     // UI 渲染
  renderToolResultMessage,  // UI 渲染
})
```

### Bash 工具的真实安全层（bashSecurity.ts）

教学版用简单字符串黑名单：
```python
dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
```

生产版用多层防御：
```typescript
// 30+ 命令替换模式
const COMMAND_SUBSTITUTION_PATTERNS = [
  { pattern: /<\(/, message: 'process substitution <()' },
  { pattern: />\(/, message: 'process substitution >()' },
  { pattern: /\$\(/, message: '$() command substitution' },
  // Zsh equals expansion, glob qualifiers, always blocks...
]

// Zsh 特有的危险命令
const ZSH_DANGEROUS_COMMANDS = new Set([
  'zmodload', 'emulate', 'sysopen', 'sysread', 'syswrite',
  'zpty', 'ztcp', 'zsocket', 'mapfile', ...
])

// 使用 TreeSitter 进行 AST 级语法分析
```

其他安全模块：
- `bashPermissions.ts` — 权限检查
- `pathValidation.ts` — 路径安全
- `readOnlyValidation.ts` — 只读模式验证
- `sedValidation.ts` — sed 命令注入防护
- `shouldUseSandbox.ts` — 沙箱判断
- `destructiveCommandWarning.ts` — 破坏性命令警告

## 前端启示

1. **工具定义 = 契约（三层模式）**：
   - `inputSchema`(Zod) = 输入契约
   - `outputSchema`(Zod) = 输出契约
   - `prompt` = 给模型的描述
   - 前端 AI 工具也应该保持这个三层结构

2. **安全层是独立模块**：不要混在业务逻辑里。分离「权限检查」→「操作执行」→「结果渲染」

3. **工具数量不是越多越好**：教学版 1 个 Bash 就能写代码，44 个工具是优化不是必须。从最少工具开始，不够再加

4. **每个工具都应该有 UI 渲染函数**：`renderToolUseMessage` 和 `renderToolResultMessage` 是 Generative UI 的基础

5. **Zod schema 提供端到端类型安全**：从工具定义 → 执行 → 结果渲染，全链路类型推导
