# 第 6 章：工具 — 从定义到执行

## 神经系统

第 5 章向你展示了 agent loop — `while(true)` 流式接收模型响应、收集工具调用并将结果反馈回去。循环是心跳。但如果没有将"模型想要运行 `git status`"翻译为实际 shell 命令的神经系统，心跳就毫无意义。

工具系统就是那个神经系统。它横跨 40+ 个工具实现、一个带 feature-flag 门控的集中注册表、一个 14 步执行流水线、一个带七种模式的权限解析器，以及一个在模型完成响应之前就启动工具的流式执行器。

## Tool 接口

每个工具参数化于三个类型：

```typescript
Tool<Input extends AnyObject, Output, P extends ToolProgressData>
```

- `Input`：Zod 对象 schema。双重职责：生成发送给 API 的 JSON Schema，以及运行时通过 `safeParse` 验证模型响应。
- `Output`：工具结果的 TypeScript 类型。
- `P`：工具发出的进度事件类型。

### buildTool() 和 Fail-Closed 默认值

没有工具定义直接构造 `Tool` 对象。每个工具都通过 `buildTool()` 工厂：

```typescript
const SAFE_DEFAULTS = {
  isEnabled:         () => true,
  isParallelSafe:    () => false,   // Fail-closed：新工具默认串行
  isReadOnly:        () => false,   // Fail-closed：默认视为写操作
  checkPermissions:  (input) => ({ behavior: 'allow', updatedInput: input }),
}
```

默认值在安全关键的地方有意 fail-closed。忘记实现 `isConcurrencySafe` 的新工具默认为 `false` — 它串行运行，绝不并行。

### 并发性是输入依赖的

`isConcurrencySafe(input: z.infer<Input>): boolean` 接受已解析的输入，因为同一个工具对某些输入安全而对其他输入不安全。BashTool 是典型例子：`ls -la` 只读且并发安全，但 `rm -rf /tmp/build` 不是。

### ToolResult 返回类型

每个 `call()` 返回一个 `ToolResult<T>`：

```typescript
type ToolResult<T> = {
  data: T
  newMessages?: (UserMessage | AssistantMessage | ...)[]
  contextModifier?: (context: ToolUseContext) => ToolUseContext
}
```

`data` 是被序列化到 API 的 `tool_result` 内容块的类型化输出。`newMessages` 让工具注入额外消息。`contextModifier` 是一个改变后续工具的 `ToolUseContext` 的函数。

## 五个关键接口方法

1. **`call()`** — 执行工具
2. **`inputSchema`** — 验证和解析输入
3. **`isConcurrencySafe()`** — 这个调用可以并行运行吗？
4. **`checkPermissions()`** — 允许吗？
5. **`validateInput()`** — 这个输入在语义上有意义吗？

## ToolUseContext：上帝对象

`ToolUseContext` 是贯穿每个工具调用的巨大上下文袋。大约有 40 个字段。它是公认的上帝对象。它存在因为替代方案更差：五个单独的接口需要 40+ 个调用点实现和传递。

这个模式被称为"存储桶"：不是五个接口，是一个具有约 40 个命名字段的对象。分组成子对象（`options`、像 `readFileState` 这样的命名字段）提供了专注接口能提供的结构，而没有声明、实现和传递五个独立接口类型到 40+ 个调用点的仪式。

## Apply This

1. **Fail-closed 默认值。** 当有疑问时，工具默认为串行、写操作、无并发。安全胜过性能。
2. **输入依赖的并发安全。** 同一工具对某些输入安全而对其他输入不安全。检查输入，而不是工具类型。
3. **自我描述的工具。** 每个工具携带自己的名称、描述、schema、prompt 和执行逻辑。
4. **集中式注册表。** 工具通过名称查找。没有分布在代码库各处的魔法字符串。
5. **上下文修饰器保持隔离。** 如果工具需要改变上下文，使用 `contextModifier` 函数。不要直接改变共享状态。
