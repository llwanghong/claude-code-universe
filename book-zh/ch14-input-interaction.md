# 第 14 章：输入与交互

## 终端键盘输入之坑

终端键盘输入是一团糟。不同的终端仿真器对相同的物理按键发送不同的字节序列。Escape 是 `\x1b`。但 Option+Left 可能是 `\x1b[1;3D`，或者 `\x1b\x1b[D`，或者完全是别的什么，取决于终端、操作系统和键盘布局。

Claude Code 必须干净地处理这个问题，因为开发者在终端中花费数小时。坏的键盘处理会立即导致用户流失。

## 键解析管道

```
原始字节 → Tokenizer → ParsedKey → Keybinding Resolver → Action → Handler
```

系统的每一层处理一个特定的关注点。理解这个管道是理解系统如何处理从简单字母数字到深层嵌套 chord 序列的一切的关键。

### Tokenizer

Tokenizer 读取来自 stdin 的原始字节并识别完整的键序列。它在五种不同的键盘协议中做到了这一点：

| 协议 | 使用的终端 | 示例 |
|---------|-------------|---------|
| xterm | 大多数现代终端 | `\x1b[1;5A` (Ctrl+Up) |
| rxvt | 较旧的 xterm 分支 | `\x1b[7~` (Home) |
| Linux console | 裸 Linux tty | `\x1b[[A` (F1) |
| Screen | GNU screen | `\x1bOQ` (F2 in screen) |
| Kitty | Kitty 终端 | `\x1b[57399u` (自定义编码) |

Tokenizer 根据前缀字节识别协议并分派到适当的子 tokenizer。结果是 `ParsedKey`——一个规范化的、独立于协议的键表示。

> 💡 **译注**：为什么会有五种协议？因为终端模拟器（Terminal emulator）没有一个统一的"键盘事件标准"。浏览器有 `KeyboardEvent`，但终端只有字节流。你在终端按 `Ctrl+Up`，iTerm2 发送 `\x1b[1;5A`，Windows Terminal 可能发送完全不同的字节序列。Claude Code 必须在最底层处理这些差异——Tokenizer 的作用就是把"哪个终端发了什么字节"这个混乱的问题在边界处解决掉，让系统的其余部分只看到干净的 `ParsedKey`。

### ParsedKey

```typescript
type ParsedKey = {
  key: string        // 'a', 'enter', 'backspace', 'left'
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}
```

一个规范化的键，其中所有协议差异已被吸收。"左箭头"在所有终端中是相同的 `ParsedKey`，无论是表示为 `\x1b[D` 还是 `\x1b[1;3D`。

### Keybinding Resolver

Keybinding resolver 将 `ParsedKey` 映射为用户可配置的动作。它支持：

- **简单绑定**：`ctrl+n` → `nextItem`
- **Chord 绑定**：`ctrl+k` 然后 `ctrl+f` → `formatCode`
- **模式特定绑定**：在 vim 的普通模式与插入模式下，相同的按键做不同的事情
- **插件提供的绑定**：插件可以在运行时注册新的绑定

Keybindings 存储在 `~/.claude/keybindings.json` 中。Resolver 在启动时加载配置并保持一个动作查找表。冲突解决是确定性的：更具体的绑定胜过更一般的绑定，用户绑定胜过默认绑定。

### Action Dispatch

Action 名称被映射到处理程序函数。处理程序更新 REPL 状态：移动光标、提交输入、切换模式、触发自动完成。调度层不知道键——它看到的是命名动作。

### Vim Mode

Claude Code 支持用于文本编辑的 vim 模式键绑定。输入区域有一个模态编辑器：

- **Normal mode**：移动、删除、yank、缩进的键绑定
- **Insert mode**：文本输入
- **Visual mode**：选择操作

Vim 模式使用与主键绑定系统相同的 `ParsedKey` → Action 管道，但带有一组不同的动作和处理程序。模式是持久的——当你切换到 vim 模式时，它保持在 vim 模式，直到你明确退出。

### 自动完成

输入区域提供上下文感知的自动完成：文件路径、命令名称、agent 类型、skill 名称。完成引擎将输入文本与全局可用完成项的注册表进行匹配。注册表从工具、agent 定义、skill 元数据和文件系统中启动时填充。

---

## Apply This

**尽早将原始输入规范化为规范形式。** 在边界处解析一次字节 → `ParsedKey`。让后续的所有内容处理干净的类型化动作。Tokenizer 知道协议差异；系统的其余部分不知道。

**支持 chords 和多种模式。** 单键绑定对于专业工具是不够的。构建一个知道模式和 chords 的键绑定系统。模式使相同的物理按键在不同上下文中具有不同的含义，而不会使绑定表爆炸。

**使键绑定可配置。** 用户对键绑定有强烈的偏好。将它们存储在配置文件中，而不是硬编码。冲突解决是确定性的。

**在边界处吸收复杂性。** 五种终端协议在管道的开头被处理。其余的一切只看到 `ParsedKey`。Tokenizer 吸收了混乱，以便处理程序不必处理。

**在模态编辑器中重用以动作为中心的设计。** Vim 模式使用与主键盘系统相同的 `ParsedKey` → Action 管道。不同的模式，不同的动作集，相同的架构。不要为模态行为编写新代码——参数化动作集。
