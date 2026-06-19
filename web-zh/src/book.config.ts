export interface Chapter {
  number: number
  title: string
  slug: string
  part: string
}

export const parts = [
  { name: '第一部分：基础', chapters: [1, 2, 3, 4] },
  { name: '第二部分：核心循环', chapters: [5, 6, 7] },
  { name: '第三部分：多 Agent 编排', chapters: [8, 9, 10] },
  { name: '第四部分：持久化与智能', chapters: [11, 12] },
  { name: '第五部分：界面', chapters: [13, 14] },
  { name: '第六部分：连接', chapters: [15, 16] },
  { name: '第七部分：性能工程', chapters: [17, 18] },
]

export const chapters: Chapter[] = [
  { number: 1, title: 'AI Agent 的架构', slug: 'ch01-architecture', part: '第一部分' },
  { number: 2, title: '快速启动 — Bootstrap 流水线', slug: 'ch02-bootstrap', part: '第一部分' },
  { number: 3, title: '状态 — 双层架构', slug: 'ch03-state', part: '第一部分' },
  { number: 4, title: '与 Claude 对话 — API 层', slug: 'ch04-api-layer', part: '第一部分' },
  { number: 5, title: 'Agent Loop', slug: 'ch05-agent-loop', part: '第二部分' },
  { number: 6, title: '工具 — 从定义到执行', slug: 'ch06-tools', part: '第二部分' },
  { number: 7, title: '并发工具执行', slug: 'ch07-concurrency', part: '第二部分' },
  { number: 8, title: '创建子 Agent', slug: 'ch08-sub-agents', part: '第三部分' },
  { number: 9, title: 'Fork Agent 与 Prompt Cache', slug: 'ch09-fork-agents', part: '第三部分' },
  { number: 10, title: '任务、协调与 Swarm', slug: 'ch10-coordination', part: '第三部分' },
  { number: 11, title: '记忆 — 跨会话学习', slug: 'ch11-memory', part: '第四部分' },
  { number: 12, title: '可扩展性 — Skills 与 Hooks', slug: 'ch12-extensibility', part: '第四部分' },
  { number: 13, title: '终端 UI', slug: 'ch13-terminal-ui', part: '第五部分' },
  { number: 14, title: '输入与交互', slug: 'ch14-input-interaction', part: '第五部分' },
  { number: 15, title: 'MCP — 通用工具协议', slug: 'ch15-mcp', part: '第六部分' },
  { number: 16, title: '远程控制与云端执行', slug: 'ch16-remote', part: '第六部分' },
  { number: 17, title: '性能工程', slug: 'ch17-performance', part: '第七部分' },
  { number: 18, title: '终章 — 我们学到了什么', slug: 'ch18-epilogue', part: '第七部分' },
]

export function getPartForChapter(num: number) {
  for (const p of parts) {
    if (p.chapters.includes(num)) return p.name
  }
}

export function getAdjacentChapters(num: number) {
  const idx = chapters.findIndex(c => c.number === num)
  return {
    prev: idx > 0 ? chapters[idx - 1] : null,
    next: idx < chapters.length - 1 ? chapters[idx + 1] : null,
  }
}
