# S07：性能工程

> 对应：书 ch17 | 源码：utils/profilerBase.ts, utils/startupProfiler.ts

## 性能驱动架构

Claude Code 做出的每一个架构决策——async generator loop、packed array 渲染、sticky latches、推测性工具执行、slot reservation——都是由性能约束驱动的。

## 关键指标

| 关注点 | 技术 | 影响 |
|----------|---------|--------|
| 启动 | 模块级 I/O 并行 + 快速路径分发 | ~240ms（预算 300ms） |
| 上下文 | Slot reservation（8K → 64K） | 在 99% 的请求中节省上下文 |
| API 成本 | Prompt cache + fork 共享 | 缓存的 token 享受 90% 折扣 |
| 渲染 | Packed arrays + cell diffing | 60fps，即使在大对话中 |
| 搜索 | 26 位字母位图预过滤器 | 消除 80% 的昂贵 rg 调用 |

## 50+ 个剖析检查点

散布在代码库中的计时检查点收集真实世界的性能数据。在随机用户子集上以 0.5% 采样以避免开销。数据驱动优化决策。

## 前端启示

1. **测量，不要假设。** 50+ 个检查点是关于什么慢的数据源，以及不进行没有数据的优化的约束
2. **Prompt cache 稳定性是架构性的。** 你的成本结构取决于字节顺序
3. **Pack arrays 适用于频繁比较的数据。** 当每一帧比较数千个单元格时获胜
4. **位图预过滤器是免费的。** 四个字节 per 条目，一个整数比较。消除昂贵搜索的 80%
5. **Slot reservation：预留少，按需升级。** 为常见情况预留少。为罕见情况升级
