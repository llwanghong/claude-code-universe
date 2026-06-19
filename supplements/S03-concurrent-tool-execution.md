# S03：并发工具执行

> 对应：书 ch07 | 源码：services/tools/StreamingToolExecutor.ts, services/tools/toolOrchestration.ts

## 核心洞察

**安全性是每个调用的，不是每个工具类型的。** `Bash("ls -la")` 并发安全。`Bash("rm -rf build/")` 不安全。检查输入，而不是工具名称。

## 分区算法

```
输入：[Read, Read, Grep, Edit, Read]
         ↓ partitionToolCalls()
输出：[
  { parallel: true,  calls: [Read, Read, Grep] },   ← 批次 1：并发
  { parallel: false, calls: [Edit] },                ← 批次 2：单独
  { parallel: true,  calls: [Read] },                ← 批次 3：并发
]
```

算法是贪心且保持顺序的。该模式使得并发优化显著，同时保证了需要顺序执行的操作不会冲突。

## 推测执行（Speculative Execution）

第二层优化：在模型完成流式响应*之前*启动并发安全的工具。

`StreamingToolExecutor` 监控流中的 `tool_use` 块。当检测到并发安全工具时，立即执行。当流完成时，工具可能已经返回结果——免费并行。

## 前端启示

1. **如果你的 AI 应用调用多个 API/工具，并发执行只读操作。** 像 `Promise.all(readCalls)` 然后顺序执行写操作
2. **对可能产生冲突的输入进行输入级安全检查。** 不要假设整个工具是安全或不安全的
3. **推测执行 = 在用户等待时启动工作。** 当 AI 生成响应时，预取可能需要的资源。如果不需要就丢弃
4. **Fail-closed：不确定时，顺序执行。** 宁可慢也不要错
5. **上下文修饰器在并发执行期间排队。** 不要立即应用副作用。先收集，再批量应用
