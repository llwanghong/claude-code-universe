# Claude Code 学习宇宙

**三个视角，一个架构 —— AI 编程 Agent 的完整学习体系。**

[English](./README.md) | [交叉索引](./CROSS_REFERENCE.md)

---

## 这是什么？

将三个独立资源整合为一个结构化学习路径，帮助你全面理解 Claude Code —— Anthropic 的生产级 AI 编程 Agent —— 的底层架构。

| 资源 | 来源 | 格式 | 视角 |
|------|------|------|------|
| **[Learn Claude Code](./upstream/learn-claude-code/)** | shareAI-lab | 12 步 Python 渐进教程 | 动手实践：从 agent loop 到自主 agent |
| **[Claude Code from Source](./upstream/claude-code-from-source/)** | alejandrobalderas | 18 章 O'Reilly 风格技术书 | 架构深潜：6 大抽象、10 个模式 |
| **[深度笔记](./deep-dive/)** | 原创 | 8 篇文章 + 学习路线 | 前端工程师视角：源码对照 + 前端启示 |
| **[补充资料](./supplements/)** | 原创 | 7 篇文章 | 深度笔记未覆盖的主题：启动、并发、MCP 等 |
| **[中文翻译](./book-zh/)** | 原创 | 18 章 | Claude Code from Source 的完整中文翻译 |

## 快速开始

### 如果你是前端工程师，想理解 AI Agent
→ 从 [深度笔记](./deep-dive/README.md) 开始，然后看 [学习路线图](./deep-dive/learning-roadmap.md)

### 如果你是后端架构师，想评估 Agent 框架
→ 从 [这本书](./upstream/claude-code-from-source/book/) 开始 — 第一章就给出了 6 大抽象

### 如果你想先动手写代码
→ 从 [Learn Claude Code](./upstream/learn-claude-code/) 开始 — `s01_agent_loop.py` 只有 120 行

### 如果你想要完整的中文资料
→ 从 [中文翻译](./book-zh/README.md) 开始

## 全景架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code 架构全景                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Agent 循环  │  │ 工具系统    │  │ 上下文压缩          │ │
│  │ (query.ts)  │  │ (44 个工具) │  │ (5 层流水线)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 子 Agent    │  │ Agent 团队  │  │ 记忆 & 技能         │ │
│  │ (递归调用)  │  │ (swarm)     │  │ (文件系统)          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 终端 UI     │  │ MCP 协议    │  │ 后台任务            │ │
│  │ (Ink fork)  │  │ (8种传输)   │  │ (7 种任务类型)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 保持更新

本仓库使用 git submodule 追踪上游：

```bash
# 克隆后
git submodule update --init --recursive

# 检查上游更新
./scripts/update-upstreams.sh
```

GitHub Actions 每周自动检查上游变更。

## 免责声明

本仓库不包含任何 Claude Code 源代码。所有原创内容中的代码块都是为了说明架构模式而撰写的伪代码。`.reference/` 目录已被 gitignore，仅包含本地参考资料。

Claude Code 是 Anthropic 的产品。本项目与 Anthropic 无任何关联、背书或赞助关系。
