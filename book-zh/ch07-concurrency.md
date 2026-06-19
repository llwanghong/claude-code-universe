# 第 7 章：并发工具执行

## 等待的代价

典型的 Claude Code 交互涉及每次 3 到 5 个工具调用。"读这两个文件，grep 这个模式，然后编辑这个函数。"如果每个工具需要 200 毫秒，顺序执行需要整整一秒。如果读和 grep 调用是独立的——它们确实是——并行运行将其削减到 200 毫秒。

但并非所有工具都是独立的。修改 `config.ts` 的 Edit 不能与另一个修改 `config.ts` 的 Edit 并发。创建一个目录的 Bash 命令必须在向其中写入文件的 Bash 命令之前完成。并发不是工具的全局属性——它是特定输入的特定工具调用的属性。

驱动整个并发系统的洞察：**安全性是每个调用（per-call）的，不是每个工具类型（per-tool-type）的**。

## 分区算法

入口点是 `partitionToolCalls()`。它接受有序的 `ToolUseBlock` 消息数组并产生一个批次数组，其中每个批次要么是"全部并发安全"要么是"单个串行工具"。

算法从左到右遍历数组。对于每个工具调用：

1. 按名称查找工具定义
2. 用工具的 Zod schema 通过 `safeParse()` 解析输入。解析失败 → 保守分类为不安全
3. 在工具定义上调用 `isConcurrencySafe(parsedInput)`。Bash 工具解析命令字符串，仅在复合命令是纯粹读取时返回 `true`
4. 合并或创建批次：安全 + 上一个批次也安全 → 追加。否则 → 新批次

```
模型请求：[Read, Read, Grep, Edit, Read]

Step 1: Read  → safe → 新批次 {safe, [Read]}
Step 2: Read  → safe → 追加   {safe, [Read, Read]}
Step 3: Grep  → safe → 追加   {safe, [Read, Read, Grep]}
Step 4: Edit  → NOT  → 新批次 {serial, [Edit]}
Step 5: Read  → safe → 新批次 {safe, [Read]}

结果: 3 个批次
  Batch 1: [Read, Read, Grep] — 并发
  Batch 2: [Edit]             — 单独
  Batch 3: [Read]             — 并发
```

## 推测执行

并发系统的第二层是**推测执行**（speculative execution）：在模型流式输出响应时就启动运行工具。

`StreamingToolExecutor` 监控流中的 `tool_use` 块。当检测到一个并发安全的工具时，它在模型完成响应之前就被启动。当流完成时，安全工具可能已经返回了结果。

上下文修饰器是微妙的：当工具并发运行时，你不能立即应用上下文修饰器，因为同一批次中的其他工具正在读取同一上下文。相反，修饰器按 tool use ID 收集并排队。

## Apply This

1. **安全性是每个调用的，而不是每个类型的。** `Bash("ls")` 安全；`Bash("rm -rf /")` 不安全。检查输入，而不是工具名称。
2. **Greedy、保持顺序的分区。** 安全的连续区间合并为一个批次。不安全的工具打破区间。简单、可预测、快速。
3. **在等待模型时启动安全工具。** 流式输出时间是空闲 CPU 时间。利用它来执行只读工具。
4. **Fail-closed：解析错误 → 串行。** 如果不能分析输入，就假设它不安全。宁可慢也不要不正确。
5. **上下文修饰器排队。** 并发工具不能立即应用上下文变化。收集、序列化、在批次后应用。
