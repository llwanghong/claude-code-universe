# 云端 Claude Code — 企业级实战项目

> 基于 [Claude Code 源码深度剖析](https://llwanghong.github.io/claude-code-universe/) 的架构知识，设计并实现一个企业内部使用的云端 Agent 平台。

## 项目定位

将 Claude Code 的核心架构（agent loop、tool system、permission model、memory、MCP）迁移到云端，集成公司内部的代码仓库、CI/CD、部署系统，提供 Web + IDE + CLI 三种交互形态。

## 文档导航

| 文档 | 状态 | 说明 |
|------|------|------|
| [总体架构设计](docs/01-architecture-design.md) | ✅ 已完成 | 5 层平面架构、模块设计、技术选型 |
| [执行层详细设计](docs/02-execution-plane.md) | ✅ 已完成 | Agent Runtime、Tool Pipeline、Sandbox、错误恢复 |
| [安全架构设计](docs/03-security.md) | ✅ 已完成 | 纵深防御 6 层、权限模型 6 步、威胁模型、合规 |
| [集成层设计](docs/04-integration.md) | ✅ 已完成 | Git/CI/CD/MCP 集成 + IDE Extension + CLI |
| [Web UI 设计](docs/05-web-ui.md) | ✅ 已完成 | 页面布局、组件树、交互流、状态管理、具体代码 |

## 项目结构

```
cloud-claude-code/
├── README.md                    ← 项目总览（本文件）
├── docs/                        ← 设计文档
│   ├── 01-architecture-design.md
│   ├── 02-execution-plane.md
│   ├── 03-security.md
│   ├── 04-integration.md
│   └── 05-web-ui.md
├── web/                         ← Web 应用（Astro + React）
│   ├── src/
│   │   ├── pages/               ← 页面
│   │   ├── components/          ← React 组件
│   │   │   ├── ChatView/        ← 对话视图
│   │   │   ├── FileTree/        ← 文件树
│   │   │   ├── DiffView/        ← Diff 视图
│   │   │   ├── PromptInput/     ← 输入框
│   │   │   └── PermissionDialog/← 权限对话框
│   │   └── layouts/             ← 布局
│   └── astro.config.mjs
└── server/                      ← 后端服务（TypeScript/Node.js）
    ├── src/
    │   ├── gateway/             ← API Gateway
    │   ├── auth/                ← 认证服务
    │   ├── session/             ← 会话管理
    │   ├── orchestrator/        ← Agent 编排器
    │   ├── agent/               ← Agent Runtime
    │   │   ├── query-loop.ts    ← 核心循环（ch05 模式）
    │   │   ├── tool-pipeline.ts ← 工具流水线（ch06 模式）
    │   │   ├── context.ts       ← 上下文管理（ch05 模式）
    │   │   └── sandbox.ts       ← Shell 沙箱
    │   ├── tools/               ← 工具实现
    │   ├── memory/              ← 记忆系统（ch11 模式）
    │   ├── mcp/                 ← MCP 集成（ch15 模式）
    │   └── model-router/        ← 模型路由
    └── tests/
```

## 架构概览

```
┌──────────────────────────────────────────────┐
│              ACCESS PLANE                     │
│    Web App  │  IDE Extension  │  CLI Client   │
├──────────────────────────────────────────────┤
│              CONTROL PLANE                    │
│   Auth  │  Session  │  Orchestrator  │  Model│
├──────────────────────────────────────────────┤
│              EXECUTION PLANE                  │
│   Agent Pod (query loop + tools + sandbox)    │
├──────────────────────────────────────────────┤
│              DATA PLANE                       │
│   Object Storage │ Redis │ Vector │ Postgres  │
└──────────────────────────────────────────────┘
```

## 核心技术栈

| 层 | 技术 |
|----|------|
| Web UI | Astro + React 19 + Tailwind v4 |
| IDE Extension | VSCode Extension API |
| API Gateway | Node.js + WebSocket/SSE |
| Agent Runtime | TypeScript (Node.js 容器内) |
| Sandbox | gVisor / Docker |
| Model | Anthropic API + DeepSeek/LLaMA (私有部署) |
| Storage | PostgreSQL + Redis + MinIO |
| Orchestration | Kubernetes |

## 与书中章节的映射

| 模块 | 对应章节 |
|------|---------|
| Agent Loop | ch05 — async generator 模式 |
| Tool System | ch06 — 14 步执行流水线 + 权限 |
| Concurrency | ch07 — 分区算法 + 推测执行 |
| Sub-agents | ch08 — runAgent 生命周期 |
| Fork & Cache | ch09 — 逐字节相同前缀 |
| Coordination | ch10 — Task 状态机 + Coordinator |
| Memory | ch11 — 文件基记忆 + LLM 召回 |
| Extensibility | ch12 — Skills + Hooks |
| Terminal UI | ch13 — 渲染流水线（Web 版可参考）|
| Input | ch14 — Keybinding 系统 |
| MCP | ch15 — 通用工具协议 |
| Remote | ch16 — Bridge + 非对称传输 |
| Performance | ch17 — 位图预过滤器 + Slot Reservation |
| Architecture | ch18 — 5 个架构赌注 |
