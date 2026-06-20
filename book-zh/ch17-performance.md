# 第 17 章：性能 — 每毫秒和每个 Token 都很重要

## 高级工程师的工具箱

性能不是让事情变快。它是在性能约束下做出不同的架构选择。Claude Code 做出的每一个架构决策——async generator loop、packed array 渲染、sticky latches、speculative execution（推测执行）、slot reservation——都是由性能驱动的。对数十万用户来说，100ms 的延迟是显著的。单个 token 开销了 90% 是季度间六位数的差异。

---

## 启动性能（第 2 章回顾）

- **module evaluation（模块加载）**：~138ms（最长的单阶段）
- **并行 I/O**：与模块加载重叠（MDM、keychain）
- **总启动预算**：300ms；实际总时间 ~240ms

保持低于 300ms 的策略：动态 import 推迟模块加载、模块级 Promise 并行化 I/O、快速路径分发在加载整个系统之前退出。

---

## Context Window 优化

Context window 是 agent 最稀缺的资源：

- **Slot reservation**：默认 8K 输出；在需要时升级到 64K。在 99% 的请求中节省上下文
- **Prompt cache**：稳定内容在前，易变内容在后。缓存前缀的 90% 折扣
- **上下文压缩**：5 层压缩流水线保持对话在限制之下
- **结果预算**：超大输出保存到磁盘，带预览。

---

## Prompt Cache 策略

- **Sticky latches**：Beta headers 永远不变
- **工具定义顺序**：内置工具在前，MCP 工具在后
- **System prompt 确定论**：对相同输入必须返回相同输出
- **Fork agent cache sharing**：子 agent 继承父 agent 的缓存前缀，约 90% 输入 token 折扣

---

## 渲染性能

- **Packed arrays**：每个单元格 4 字节 vs 1 个 JS 对象。每帧零 GC。
- **Cell-level diffing**：每帧只输出更改的单元格。空闲时输出零字节。
- **Pool-based interning**：样式对象被 intern 而不是分配。
- **Frame budget**：在 requestAnimationFrame 边界批处理更新。

---

## 搜索性能

- 内置 ripgrep（vendor/ripgrep）
- 26 位字母位图预过滤器：检查文件是否包含搜索字符串中的所有字母。四个字节每条目，一次整数比较。消除约 80% 的昂贵搜索。

---

## 50+ 剖析检查点

散布在代码库中，以 0.5% 的采样率收集真实世界的性能数据。这些数据驱动优化决策——没有数据，优化是猜测。

---

## Apply This

**测量，不要假设。** 50+ 检查点是关于什么慢的数据源。没有数据，你会优化错误的东西。

**Prompt cache 稳定性是架构性的。** System prompt 和工具定义中的字节顺序决定了你的成本结构。改变一个字节就改变了一切。

**Slot reservation：为常见情况预留少，按需升级。** 默认 8K。仅在模型命中上限时升级到 64K。

**Packed arrays 用于频繁变化的数据。** 60fps 比较数千个单元格时，typed arrays > 对象数组。

**位图预过滤器是免费的。** 四个字节每条目，一个整数比较。如果消除 80% 的昂贵搜索，值得。
