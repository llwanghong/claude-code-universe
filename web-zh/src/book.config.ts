export interface PartConfig {
  number: number;
  title: string;
  epigraph: string;
  chapters: number[];
}

export interface ChapterConfig {
  number: number;
  slug: string;
  title: string;
  description: string;
}

export const parts: PartConfig[] = [
  {
    number: 1,
    title: '第一部分：基础',
    epigraph: '在 agent 能够思考之前，进程必须存在。',
    chapters: [1, 2, 3, 4],
  },
  {
    number: 2,
    title: '第二部分：核心循环',
    epigraph: 'agent 的心跳：流式、行动、观察、重复。',
    chapters: [5, 6, 7],
  },
  {
    number: 3,
    title: '第三部分：多 Agent 编排',
    epigraph: '一个 agent 是强大的。多个 agent 协作是革命性的。',
    chapters: [8, 9, 10],
  },
  {
    number: 4,
    title: '第四部分：持久化与智能',
    epigraph: '没有记忆的 agent 会永远重复同样的错误。',
    chapters: [11, 12],
  },
  {
    number: 5,
    title: '第五部分：界面',
    epigraph: '用户看到的一切都经过这一层。',
    chapters: [13, 14],
  },
  {
    number: 6,
    title: '第六部分：连接',
    epigraph: 'agent 的触角伸向 localhost 之外。',
    chapters: [15, 16],
  },
  {
    number: 7,
    title: '第七部分：性能工程',
    epigraph: '让一切快得人类察觉不到背后的机械运转。',
    chapters: [17, 18],
  },
];

export const chapters: ChapterConfig[] = [
  { number: 1, slug: 'ch01-architecture', title: 'AI Agent 的架构', description: '6 大关键抽象、数据流、权限系统、构建系统' },
  { number: 2, slug: 'ch02-bootstrap', title: '快速启动 — Bootstrap 流水线', description: '5 阶段初始化、模块级 I/O 并行、信任边界' },
  { number: 3, slug: 'ch03-state', title: '状态 — 双层架构', description: 'Bootstrap 单例、AppState store、sticky latches、成本追踪' },
  { number: 4, slug: 'ch04-api-layer', title: '与 Claude 对话 — API 层', description: '多 provider 客户端、prompt cache、流式、错误恢复' },
  { number: 5, slug: 'ch05-agent-loop', title: 'Agent Loop — 核心循环', description: 'query.ts 深度解析、4 层压缩、错误恢复、token 预算' },
  { number: 6, slug: 'ch06-tools', title: '工具 — 从定义到执行', description: 'Tool 接口、14 步流水线、权限系统' },
  { number: 7, slug: 'ch07-concurrency', title: '并发工具执行', description: '分区算法、流式执行器、推测执行' },
  { number: 8, slug: 'ch08-sub-agents', title: '创建子 Agent', description: 'AgentTool、15 步 runAgent 生命周期、内置 agent 类型' },
  { number: 9, slug: 'ch09-fork-agents', title: 'Fork Agent 与 Prompt Cache', description: '逐字节相同前缀技巧、cache 共享、成本优化' },
  { number: 10, slug: 'ch10-coordination', title: '任务、协调与 Swarm', description: 'Task 状态机、coordinator 模式、swarm 消息' },
  { number: 11, slug: 'ch11-memory', title: '记忆 — 跨会话学习', description: '基于文件的记忆、4 种类型分类、LLM 召回、过时检测' },
  { number: 12, slug: 'ch12-extensibility', title: '可扩展性 — Skills 与 Hooks', description: '两阶段 skill 加载、生命周期 hooks、快照安全' },
  { number: 13, slug: 'ch13-terminal-ui', title: '终端 UI', description: '自定义 Ink fork、渲染流水线、双缓冲、池化' },
  { number: 14, slug: 'ch14-input-interaction', title: '输入与交互', description: '键解析、keybindings、chord 支持、vim 模式' },
  { number: 15, slug: 'ch15-mcp', title: 'MCP — 通用工具协议', description: '8 种传输、OAuth for MCP、工具包装' },
  { number: 16, slug: 'ch16-remote', title: '远程控制与云端执行', description: 'Bridge v1/v2、CCR、upstream proxy' },
  { number: 17, slug: 'ch17-performance', title: '性能 — 每毫秒和每个 Token 都很重要', description: '启动、context window、prompt cache、渲染、搜索' },
  { number: 18, slug: 'ch18-epilogue', title: '终章 — 我们学到了什么', description: '5 个架构赌注、哪些模式可转移、agent 的发展方向' },
];

export function getPartForChapter(chapterNumber: number): PartConfig | undefined {
  return parts.find(p => p.chapters.includes(chapterNumber));
}

export function getChapterNumber(slug: string): number {
  const match = slug.match(/^ch(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function getAdjacentChapters(chapterNumber: number) {
  const idx = chapters.findIndex(c => c.number === chapterNumber);
  return {
    prev: idx > 0 ? chapters[idx - 1] : null,
    next: idx < chapters.length - 1 ? chapters[idx + 1] : null,
  };
}

export function isFirstChapterOfPart(chapterNumber: number): boolean {
  return parts.some(p => p.chapters[0] === chapterNumber);
}
