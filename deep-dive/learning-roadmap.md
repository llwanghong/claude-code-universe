# Agent Harness 工程师学习路线

## 能力定位

学完所有材料后：
- 理解 Agent 系统架构 → 🟢 深入
- 自己写 Agent Loop → 🟢 熟练
- 设计 Tool System → 🟢 熟练
- 上下文管理策略 → 🟡 有概念（需实践）
- 多 Agent 编排 → 🟡 有概念（需实践）
- 从零造 Agent MVP → 🟡 能做

## 五阶段路线

### 阶段一：跑通教学版（1-2 周）

**目标**：建立肌肉记忆

```bash
cd upstream/learn-claude-code
# 配置 .env，填入 API key
# 从 s01 跑到 s12，每个都亲手跑一遍
```

**检验**：不看源码，能默写出 agent_loop 的 5 步核心循环。

### 阶段二：对照生产源码精读（3-4 周）

**目标**：理解「教学版 → 生产版」之间的鸿沟

必读 10 个文件：
1. `query.ts` — 生产级 Agent Loop（2-3天）
2. `Tool.ts` — buildTool 模式（1天）
3. `services/compact/microCompact.ts` — 微压缩（半天）
4. `services/compact/compact.ts` — LLM 摘要压缩（1天）
5. `services/compact/autoCompact.ts` — 触发+防死循环（半天）
6. `tools/BashTool/bashSecurity.ts` — 安全层（1天）
7. `tools/AgentTool/runAgent.ts` — Subagent 递归（半天）
8. `utils/swarm/` — Agent 团队编排（1天）
9. `tasks/` — 任务系统（半天）
10. `services/mcp/` — MCP 协议（1天）

**检验**：能对着深度笔记的架构图讲出每个模块的实现细节。

### 阶段三：仿写最小 Agent（2-4 周）

**v0**：80 行 TypeScript，只给 Bash 一个工具
**v1**：加入 Tool System + TodoWrite + Subagent（300 行）
**v2**：加入 Compaction + Skills（500 行）

**检验**：v2 能独立完成一个编程任务。

### 阶段四：做 AI-Native 产品（4-8 周）

**选题建议**：
- ⭐ AI 代码审查 CLI
- ⭐⭐ 设计稿→前端代码 Agent
- ⭐⭐⭐ AI 编程教学助手
- ⭐⭐⭐⭐ 多人 AI 团队协作工具

**检验**：有真实用户愿意用。

### 阶段五：垂直领域深耕（持续）

**方向**：
- 前端 AI 研发工具链
- 设计→代码 Pipeline
- 企业级 Agent 平台
- AI 代码审查
- MCP 生态

## 总时间线

```
第 1-2 周   ██░░░░░░░░  阶段一：跑通 12 个教学文件
第 3-6 周   ████░░░░░░  阶段二：精读 10 个核心生产文件
第 7-10 周  ██████░░░░  阶段三：仿写 v0→v1→v2
第 11-18 周 ████████░░  阶段四：做 AI-Native 产品
第 19 周+   ██████████  阶段五：垂直领域深耕
```

约 4-5 个月，从前端工程师 → 能独立设计 Agent 系统的 Harness 工程师。
