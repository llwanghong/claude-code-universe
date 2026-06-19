# 第 13 章：终端 UI

## 终端中的 React

Claude Code 的 UI 使用 React 渲染到终端。但 React 是为 DOM 构建的，不是为终端。解决方案：一个自定义 Ink fork，重新实现了渲染管道。

## Ink Fork

标准的 Ink 渲染器在每个帧上输出整个终端缓冲区。这对于静态 UI 有效，但在以 60fps 进行流式输出时失效。渲染 200×80 的字符网格 = 每帧 16,000 个单元格。每秒 60 帧 = 每秒 960,000 次单元格比较。加上随着对话增长而增长的消息数组，每帧都在分配和重新比较 React 元素树。

Fork 的渲染器做出三个改变：

**Packed typed arrays。** 不是对象数组（每个单元格一个对象），渲染器使用紧凑的 typed arrays。四个字节 per 单元格，而不是一个 JS 对象 per 单元格。内存使用：200×80×4 = 64KB，而不是 ~3MB 的 JS 对象开销。

**Cell-level diffing。** 渲染器比较两个 packed arrays 的逐单元格内容变化，仅向终端输出更改的单元格。而不是在每一帧上输出整个缓冲区。

**Pool-based interning。** 重复样式（颜色、字体粗细）被 intern 到共享池中，而不是为每个单元格创建一个新对象。一个 200×80 的终端可能只有 5 种独特的样式组合，但标准渲染器为每个单元格分配一个新的样式对象。Pool 通过共享引用消除了这种冗余。

## 渲染管道

```mermaid
flowchart LR
    React["React Tree"] --> Commit["Commit Phase"]
    Commit --> Diff["Cell-level Diff"]
    Diff --> Output["ANSI Output"]
    Output --> Terminal["终端"]
```

## 组件树

UI 由 React 组件组成：
- REPL 容器（主要布局）
- 消息列表（对话历史）
- 输入区域（提示、文本输入、建议）
- 工具批准对话框（权限提示）
- 进度指示器（spinner、agent 状态）
- 上下文组件（通知、mailbox、覆盖层）

## Apply This

1. **Packed arrays 用于频繁比较的数据。** 当每一帧比较数千个单元格时，typed arrays 在内存和速度上胜过对象数组。
2. **仅输出改变的内容。** Cell-level diffing 将每帧输出从整个屏幕减少到几个已更改的单元格。
3. **Intern 重复值。** 当许多对象共享相同属性时，将它们 intern 到共享池中。一个引用比较取代 N 次属性比较。
4. **React 可以在 DOM 之外工作。** 自定义渲染器将 React 的组件模型带到目标平台——终端、canvas、PDF——而不改变组件 API。
5. **优化瓶颈，而不是一般情况。** Fork 的渲染器针对流式进行了优化——文本快速变化，样式很少变化。针对你的具体瓶颈进行设计。
