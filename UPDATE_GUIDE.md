# 更新指南

当上游仓库有更新时，告诉我以下任何一句话即可，我会自动完成。

---

## 场景一：claude-code-from-source 英文书更新了

**你需要做的**：告诉我

> "书更新了，同步一下"

或者更具体：
> "claude-code-from-source 有新 commit，帮我对照更新中文翻译"

**我会自动做的**：
1. `git submodule update --remote upstream/claude-code-from-source`
2. `./scripts/sync-check.sh` 扫描变更
3. 列出哪些英文章节变了
4. 逐章对中文翻译进行增量更新
5. 更新 `book-zh/TRANSLATION_LOG.md` 中的基准 commit
6. 提交 commit

---

## 场景二：learn-claude-code 教学仓库更新了

**你需要做的**：告诉我

> "learn-claude-code 更新了，同步分析一下"

**我会自动做的**：
1. `git submodule update --remote upstream/learn-claude-code`
2. 检查 12 个 Python 文件和 docs/zh/ 文档的变更
3. 如果教学代码变了 → 更新 `deep-dive/` 中的代码引用
4. 如果中文文档变了 → 直接 diff 展示（上游自带中文）
5. 更新 `deep-dive/` 和 `CROSS_REFERENCE.md` 中受影响的引用

---

## 场景三：Claude Code 发了新版本 npm 包

**你需要做的**：告诉我

> "Claude Code 出新版本了，帮我分析新架构"

或者直接拖入/指定新的 `.tgz` 文件路径。

**我会自动做的**：
1. 解压新版本到临时目录
2. 从 `cli.js.map` 提取新版本源码
3. Diff 新旧源码，分析架构变化
4. 更新 `deep-dive/` 中受影响的笔记
5. 更新 `CROSS_REFERENCE.md` 中的源码引用
6. 如果有重大变化 → 更新 `book-zh/` 对应的中文章节

---

## 场景四：新发现了一个相关仓库想整合进来

**你需要做的**：告诉我

> "发现了一个新仓库 https://github.com/xxx/xxx 帮我分析价值，看看要不要整合"

**我会自动做的**：
1. Clone/分析该仓库
2. 与现有三份资源对比（内容重叠度、独特价值、视角差异）
3. 给出建议：是否作为 submodule 加入，或写摘要到 supplements
4. 如果同意整合 → 添加到仓库并更新所有索引

---

## 场景五：定期维护

**你需要做的**：告诉我

> "检查一下有没有更新"

**我会自动做的**：
1. 拉取所有 submodule 的 remote
2. 运行 `./scripts/sync-check.sh`
3. 如果有变更 → 按场景一/二处理
4. 如果没变更 → 报告"一切最新"

---

## 快速参考

```
触发词                                → 执行动作
──────────────────────────────────────────────────────────
"书更新了" / "同步翻译"                → 同步 claude-code-from-source 中文翻译
"learn-claude-code 更新了"             → 同步教学仓库变更
"Claude Code 出新版了"                 → 分析新版本架构变更
"这个新仓库 XXX 有价值吗"              → 评估新资源，决定是否整合
"检查更新" / "看看有没有新东西"         → 全面检查所有上游
```

---

## 会更新到的文件

| 上游有变化 | 会联动更新的文件 |
|-----------|----------------|
| claude-code-from-source book | `book-zh/ch*.md`, `book-zh/TRANSLATION_LOG.md`, `CROSS_REFERENCE.md` |
| learn-claude-code agents | `deep-dive/0*.md`（代码引用部分）, `CROSS_REFERENCE.md`, `deep-dive/learning-roadmap.md` |
| Claude Code npm 包 | `deep-dive/0*.md`（生产源码对照部分）, `CROSS_REFERENCE.md`, `supplements/S*.md` |
| 新增仓库 | `upstream/`（submodule）, `CROSS_REFERENCE.md`, `README.md`, `supplements/` |
