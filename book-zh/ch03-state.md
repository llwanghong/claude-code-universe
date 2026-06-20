# 第 3 章：状态 — 双层架构

第 2 章追踪了从进程启动到首次渲染的 bootstrap 流水线。到最后，系统有了一个完全配置的环境。但是用*什么*配置的？会话 ID 在哪里？当前模型？消息历史？成本追踪器？权限模式？状态在哪里，为什么在那里？

每个长时间运行的应用最终都会面对这个问题。对于简单的 CLI 工具，答案是平凡的——`main()` 里的几个变量。但 Claude Code 不是一个简单的 CLI 工具。它是一个通过 Ink 渲染的 React 应用，进程生命周期跨越数小时，插件系统在任意时间加载，API 层必须从缓存上下文中构造 prompt，成本追踪器在进程重启后仍然存活，数十个基础设施模块需要在不相互 import 的情况下读写共享数据。

天真的方法——单一全局 store——会立刻失败。原因很直接：如果成本追踪器更新了驱动 React 重渲染的同一个 store，每次 API 调用都会触发完整的组件树 reconciliation（协调，即 React 对比新旧虚拟 DOM 并更新实际 DOM 的过程）。基础设施模块（bootstrap、上下文构建、成本追踪、遥测）不能 import React——它们在 React 挂载之前运行，在 React 卸载之后运行，甚至在根本没有组件树存在的上下文中运行。把所有东西放进一个 React-aware store 会在整个 import 图中创建循环依赖，导致启动序列无法正常工作。

Claude Code 用双层架构解决这个问题：一个可变进程单例用于基础设施状态，一个最小化的响应式 store 用于 UI 状态。本章解释这两层、桥接它们的副作用系统，以及依赖这个基础的支持性子系统。每一个后续章节都假设你理解了状态在哪里以及为什么在那里。

---

## 3.1 Bootstrap State — 进程单例

### 为什么是可变单例

Bootstrap state 模块（`bootstrap/state.ts`）是一个在进程启动时创建一次的单一可变对象：

```typescript
const STATE: State = getInitialState()
```

这行上方的注释写着：`AND ESPECIALLY HERE`。类型定义上方两行：`DO NOT ADD MORE STATE HERE - BE JUDICIOUS WITH GLOBAL STATE`。这些注释带有工程师从艰难经验中学到了不受控全局对象代价的语气。

可变单例在这里是正确的选择，原因有三个。第一，bootstrap state 必须在任何框架初始化之前可用——在 React 挂载之前，在 store 创建之前，在插件加载之前。模块作用域初始化是唯一保证 import 时可用的机制。第二，数据本质上是进程作用域的：会话 ID、遥测计数器、成本累加器、缓存路径。没有有意义的"先前状态"来 diff，没有需要通知的订阅者，没有撤销历史。第三，该模块必须是 import 依赖图中的叶子节点。如果它 import 了 React、store 或任何服务模块，会创建打破第 2 章描述的 bootstrap 序列的循环。通过只依赖工具类型和 `node:crypto`，它保持可从任何地方 import。

### 约 80 个字段

`State` 类型包含大约 80 个字段。一个抽样揭示了其广度：

**身份和路径** — `originalCwd`、`projectRoot`、`cwd`、`sessionId`、`parentSessionId`。`originalCwd` 通过 `realpathSync` 和 NFC 规范化在进程启动时解析，且永不改变。

**成本和指标** — `totalCostUSD`、`totalAPIDuration`、`totalLinesAdded`、`totalLinesRemoved`。这些在整个会话中单调累积，并在退出时持久化到磁盘。

**遥测** — `meter`、`sessionCounter`、`costCounter`、`tokenCounter`。OpenTelemetry 句柄，全部可为 null（在遥测初始化之前为 null）。

**模型配置** — `mainLoopModelOverride`、`initialMainLoopModel`。当用户在会话中途更改模型时设置 override。

**会话标志** — `isInteractive`、`kairosActive`、`sessionTrustAccepted`、`hasExitedPlanMode`。在会话期间门控行为的布尔值。

**缓存优化** — `promptCache1hAllowlist`、`promptCache1hEligible`、`systemPromptSectionCache`、`cachedClaudeMdContent`。这些存在是为了防止冗余计算和 prompt cache 破坏。

### Getter/Setter 模式

`STATE` 对象从不直接导出。所有访问都经过大约 100 个独立的 getter 和 setter 函数：

```typescript
// Pseudocode — illustrates the pattern
export function getProjectRoot(): string {
  return STATE.projectRoot
}

export function setProjectRoot(dir: string): void {
  STATE.projectRoot = dir.normalize('NFC')  // NFC normalization on every path setter
}
```

这个模式强制了封装、每个路径 setter 上的 NFC 规范化（防止 macOS 上的 Unicode 不匹配）、类型收窄以及 bootstrap 隔离。代价是冗长——80 个字段对应一百个函数。但在一个杂散修改可能破坏 50,000 token 的 prompt cache 的代码库中，明确性胜出。

### Signal 模式

全局状态的一个子集——例如 feature flags 和配置值——是可变的，但更改必须在未来的某个点被观察到。Signal 模式处理这种情况：

```typescript
type Signal<T> = {
  get(): T
  set(v: T): void
  onChange(fn: (v: T) => void): () => void  // returns unsubscribe
}
```

Signal 不是一个事件发射器。没有事件名称、没有通配符、没有内置去重。它是一个值包装器，带有一个单一的 onChange 订阅者列表，在当前 tick 中同步调用。基础设施模块设置 signal 值；UI 模块订阅变化。桥接是窄的：大约六个 signal 存在，每个映射到一个特定的订阅者。

### Sticky Latches

一些配置值在整个会话中稳定至关重要。经典的例子是 beta headers——发送到 API 以启用 beta 功能的 HTTP headers。如果这些在会话中途改变，API 会将新请求视为不同的缓存键并无效化整个 prompt cache，导致下一个请求的延迟和成本飙升。

模式被称为 sticky latch（粘性锁存）：值在第一次读取时设置一次，之后就"粘住"了——即使底层状态后续发生变化，latch 返回的仍是初始值。想象一下蛤蜊：外壳一旦闭合就再也打不开，里面的珍珠永远是当初那颗。

```typescript
// Pseudocode
let latched: string | undefined
export function getBetaHeaders(): string[] {
  if (!latched) latched = computeBetaHeaders(STATE)
  return latched
}
```

Latch 在函数首次被调用时隐式设置。没有显式的 `init()` 调用。没有超时。它像一粒米在蛤蜊中——一层不可变的 shell 包裹着一个在足够早的时刻被捕获的值，以在可能改变之前创建稳定的契约。

大约有六个 sticky latch 分布在代码库中，每个守卫一个影响 prompt cache 键的值。模式是一样的：懒求值一次，缓存结果，永不失效。

### 成本追踪

成本追踪器（`cost-tracker.ts`）是一个特殊的子系统，它既是基础设施状态，又需要持久化。它累计 token 计数并按模型类型和查询源跟踪美元成本。计数器在会话中单调增加，在退出时写入磁盘，并在恢复时重新加载。

由于 API 在流式响应完成之前不报告成本，追踪器使用启发式方法估算。当实际成本可用时，估算被修正。最终数字精确到分。

---

## 3.2 AppState Store — UI 的响应式层

### 34 行，Zustand 风格

UI 状态在语义上不同于基础设施状态。消息被追加。工具审批出现然后消失。进度条在后台工作中推进。这些是需要通知订阅者并触发重渲染的变化。

AppState store 是一个最小化的响应式 store，约 34 行：

```typescript
// Pseudocode — illustrates the pattern
const useStore = create((set, get) => ({
  messages: [],
  inputMode: 'normal',
  toolApprovals: [],
  progress: {},
  // ... ~15 more fields
}))
```

它遵循 Zustand API——`create()` 返回一个 hook，组件用它来订阅分片（slices）。没有 action 类型、没有 reducer、没有中间件。store 暴露直接设置状态的函数，组件用选择器防止不必要的重渲染。

### 分离

基础设施状态不触发重渲染。成本追踪器每秒更新十次。如果每次计数都触发协调（reconciliation），终端渲染器的 60fps 目标将在加载第一个屏幕之前死亡。

UI 状态不关心启动顺序。消息数组可以在 React 挂载之后填充。工具审批可以在用户看到第一个提示之后出现。响应式层与第 2 章描述的 import 顺序完全解耦。

---

## 3.3 桥接两层

### 副作用系统

基础设施状态和响应式状态不是通过 imports 连接，而是通过副作用：

```typescript
// Pseudocode
STATE.costTracker.onUpdate((totalCost) => {
  useStore.getState().setCost(totalCost)
})
```

基础设施模块不知道 store 的存在。它们暴露 `onUpdate` 回调或 signals。一个独立的桥接模块订阅基础设施事件并写入响应式 store。订阅在 React 挂载后设置，在卸载前拆除。在此期间，两层保持同步。

分离意味着基础设施可以在没有 UI 的情况下运行——headless 模式、print 模式、SDK 模式——而响应式层从不初始化。没有条件检查，没有 stub store，没有守卫。基础设施层只是工作，没有 UI 来观察它。

---

## Apply This

**将基础设施状态与 UI 状态分离。** 会话配置、成本和遥测每分钟变化一次，不需要触发重渲染。消息和进度指示器每秒变化十次，需要。使用不带响应性的可变单例用于前者，带选择器的响应式 store 用于后者。

**Getter 和 setter 胜过直接属性访问。** 一百个函数用于八十个字段的代价值得。每个 setter 可以规范化、验证或记录。每个 getter 可以 lazily compute 或返回默认值。直接暴露 `STATE` 会消除这些接缝。

**Sticky latches 用于缓存稳定性。** 如果一个值影响 prompt cache 键，在第一次读取时懒求值它，并永不使其失效。beta headers 是最重要的例子，但任何改变网络请求签名的配置值都需要相同的处理。

**Signals 用于窄桥接。** 基础设施层应该不知道 UI。暴露 signals 或回调，在初始化后让一个独立的桥接模块连接它们。当没有 UI 存在时（headless 模式），桥接从不运行，基础设施也不关心。

**幂等 init 消除排序 bug。** `init()` memoization 模式使初始化安全地可以从多个入口点重复调用。结合 getter/setter 封装，对于"哪个入口点首先调用 init()"的问题不可能出错——它们都调用，它运行一次，行为相同。
