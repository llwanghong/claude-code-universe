# Claude Code from Source — 中文翻译

翻译自 [alejandrobalderas/claude-code-from-source](https://github.com/alejandrobalderas/claude-code-from-source)，一本分析 Claude Code 内部架构的 O'Reilly 风格技术书。

## 目录

### 第一部分：基础
| # | 章节 | 核心内容 |
|---|------|---------|
| 1 | [AI Agent 的架构](./ch01-architecture.md) | 6 大抽象、数据流、权限系统 |
| 2 | [快速启动 — Bootstrap 流水线](./ch02-bootstrap.md) | 5 阶段初始化、模块级 I/O 并行、信任边界 |
| 3 | [状态 — 双层架构](./ch03-state.md) | Bootstrap 单例、AppState store、sticky latches |
| 4 | [与 Claude 对话 — API 层](./ch04-api-layer.md) | 多 provider 客户端、prompt cache、流式、错误恢复 |

### 第二部分：核心循环
| # | 章节 | 核心内容 |
|---|------|---------|
| 5 | [Agent Loop](./ch05-agent-loop.md) | query.ts 深度解析、4 层压缩、错误恢复、token 预算 |
| 6 | [工具 — 从定义到执行](./ch06-tools.md) | Tool 接口、14 步流水线、权限系统 |
| 7 | [并发工具执行](./ch07-concurrency.md) | 分区算法、流式执行器、推测执行 |

### 第三部分：多 Agent 编排
| # | 章节 | 核心内容 |
|---|------|---------|
| 8 | [创建子 Agent](./ch08-sub-agents.md) | AgentTool、15 步 runAgent 生命周期、内置 agent 类型 |
| 9 | [Fork Agent 与 Prompt Cache](./ch09-fork-agents.md) | 字节相同前缀技巧、cache 共享、成本优化 |
| 10 | [任务、协调与 Swarm](./ch10-coordination.md) | 任务状态机、coordinator 模式、swarm 消息 |

### 第四部分：持久化与智能
| # | 章节 | 核心内容 |
|---|------|---------|
| 11 | [记忆 — 跨会话学习](./ch11-memory.md) | 基于文件的记忆、4 类型分类法、LLM 召回 |
| 12 | [可扩展性 — Skills 与 Hooks](./ch12-extensibility.md) | 两阶段 skill 加载、生命周期 hooks、快照安全 |

### 第五部分：界面
| # | 章节 | 核心内容 |
|---|------|---------|
| 13 | [终端 UI](./ch13-terminal-ui.md) | 自定义 Ink fork、渲染流水线、double-buffer、pools |
| 14 | [输入与交互](./ch14-input-interaction.md) | 键解析、keybindings、chord 支持、vim 模式 |

### 第六部分：连接
| # | 章节 | 核心内容 |
|---|------|---------|
| 15 | [MCP — 通用工具协议](./ch15-mcp.md) | 8 种传输、OAuth for MCP、工具包装 |
| 16 | [远程控制与云端执行](./ch16-remote.md) | Bridge v1/v2、CCR、upstream proxy |

### 第七部分：性能工程
| # | 章节 | 核心内容 |
|---|------|---------|
| 17 | [性能 — 每毫秒和每个 Token 都很重要](./ch17-performance.md) | 启动优化、context window、prompt cache、渲染、搜索 |
| 18 | [终章 — 我们学到了什么](./ch18-epilogue.md) | 5 个架构赌注、哪些模式可转移、Agent 的未来方向 |

## 翻译说明

- 保持原书 Mermaid 图表不变
- 代码块保留英文（伪代码，非真实源码）
- 专有名词首次出现时附英文原文
- 每章保留 "Apply This" 部分
