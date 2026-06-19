export interface Chapter {
  number: number
  title: string
  description: string
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
  { number: 1, title: 'AI Agent 的架构', description: '', part: '第一部分' },
  { number: 2, title: '快速启动 — Bootstrap 流水线', description: '', part: '第一部分' },
  { number: 3, title: '状态 — 双层架构', description: '', part: '第一部分' },
  { number: 4, title: '与 Claude 对话 — API 层', description: '', part: '第一部分' },
  { number: 5, title: 'Agent Loop', description: '', part: '第二部分' },
  { number: 6, title: '工具 — 从定义到执行', description: '', part: '第二部分' },
  { number: 7, title: '并发工具执行', description: '', part: '第二部分' },
  { number: 8, title: '创建子 Agent', description: '', part: '第三部分' },
  { number: 9, title: 'Fork Agent 与 Prompt Cache', description: '', part: '第三部分' },
  { number: 10, title: '任务、协调与 Swarm', description: '', part: '第三部分' },
  { number: 11, title: '记忆 — 跨会话学习', description: '', part: '第四部分' },
  { number: 12, title: '可扩展性 — Skills 与 Hooks', description: '', part: '第四部分' },
  { number: 13, title: '终端 UI', description: '', part: '第五部分' },
  { number: 14, title: '输入与交互', description: '', part: '第五部分' },
  { number: 15, title: 'MCP — 通用工具协议', description: '', part: '第六部分' },
  { number: 16, title: '远程控制与云端执行', description: '', part: '第六部分' },
  { number: 17, title: '性能工程', description: '', part: '第七部分' },
  { number: 18, title: '终章 — 我们学到了什么', description: '', part: '第七部分' },
]

export function getPartForChapter(chapterNum: number): string | undefined {
  for (const part of parts) {
    if (part.chapters.includes(chapterNum)) return part.name
  }
  return undefined
}

export function getChapterNumber(slug: string): number {
  const match = slug.match(/^ch(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

export function getAdjacentChapters(chapterNum: number) {
  const idx = chapters.findIndex(c => c.number === chapterNum)
  return {
    prev: idx > 0 ? chapters[idx - 1] : null,
    next: idx < chapters.length - 1 ? chapters[idx + 1] : null,
  }
}
