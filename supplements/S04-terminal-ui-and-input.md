# S04：终端 UI 与输入交互

> 对应：书 ch13 + ch14 | 源码：ink/, components/, cli/handlers/

## 终端中的 React

Claude Code 使用一个自定义的 Ink fork 来在终端中渲染 React。Fork 的渲染器针对高帧率流式进行了优化：packed typed arrays、cell-level diffing、pool-based interning。

## 键盘输入

终端键盘输入是混乱的——五种不同的协议，不同的终端发送相同物理按键的不同字节序列。Claude Code 通过以下方式处理这个问题：

```
原始字节 → ParsedKey（规范形式）→ 键绑定解析器 → 动作分发 → 处理程序
```

支持 chords、模式特定绑定、vim 模式。

**在边界处吸收混乱。** 管道开头处理五种终端协议。其余的一切只看到干净的 `ParsedKey` 对象。

## 前端启示

1. **早解析，晚验证。** 在边界处将原始输入规范化为类型化形式。让后续的所有内容处理干净的数据
2. **Packed arrays 适用于高频比较的数据。** 当每帧比较数千个单元格时获胜
3. **仅输出改变的内容。** Cell-level diffing 将每帧输出减少到仅更改的单元格
4. **Intern 重复值。** 当许多对象共享相同属性时，将它们 intern 到共享池中
5. **键绑定应该是可配置的。** 开发者对键盘快捷键有强烈的偏好。不要硬编码它们
