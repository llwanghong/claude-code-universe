# Claude Code Universe

**Three perspectives on one architecture — a complete guide to understanding production AI coding agents.**

[中文入口](./README-zh.md) | [Cross Reference](./CROSS_REFERENCE.md)

---

## What Is This?

This repository combines three independent resources into one structured learning path for understanding how Claude Code — Anthropic's production AI coding agent — works under the hood.

| Resource | Source | Format | Perspective |
|----------|--------|--------|-------------|
| **[Learn Claude Code](./upstream/learn-claude-code/)** | shareAI-lab | 12-step Python tutorial | Progressive hands-on: from loop to autonomous agents |
| **[Claude Code from Source](./upstream/claude-code-from-source/)** | alejandrobalderas | 18-chapter O'Reilly-style book | Architecture deep dive: 6 abstractions, 10 patterns |
| **[Deep Dive Notes](./deep-dive/)** | Original | 8 articles + roadmap | Frontend engineer's view: source code comparison + frontend takeaways |
| **[Supplements](./supplements/)** | Original | 7 articles | Topics not covered in deep-dive: bootstrap, concurrency, MCP, etc. |
| **[Chinese Translation](./book-zh/)** | Original | 18 chapters | Full Chinese translation of the book |

## Quick Start

### If you're a frontend engineer wanting to understand AI agents
→ Start with [Deep Dive Notes](./deep-dive/README.md), then [Learning Roadmap](./deep-dive/learning-roadmap.md)

### If you're a backend architect evaluating agent frameworks
→ Start with [the Book](./upstream/claude-code-from-source/book/) — Chapter 1 gives you the 6 abstractions

### If you want hands-on code first
→ Start with [Learn Claude Code](./upstream/learn-claude-code/) — `s01_agent_loop.py` is 120 lines

### If you want everything in Chinese
→ Start with [中文翻译](./book-zh/README.md) + [中文入口](./README-zh.md)

## The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Architecture                  │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Agent Loop  │  │ Tool System │  │ Context Compression │ │
│  │ (query.ts)  │  │ (44 tools)  │  │ (5-layer pipeline)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Sub-agents  │  │ Agent Teams │  │ Memory & Skills     │ │
│  │ (recursive) │  │ (swarm)     │  │ (file-based)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Terminal UI │  │ MCP Protocol│  │ Background Tasks    │ │
│  │ (Ink fork)  │  │ (8 transports)│ │ (7 task types)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Staying Current

This repo uses git submodules to track upstream repositories:

```bash
# After cloning
git submodule update --init --recursive

# Check for upstream updates
./scripts/update-upstreams.sh
```

GitHub Actions runs a weekly check for upstream changes.

**How to trigger updates**: See [Update Guide](./UPDATE_GUIDE.md) — tell me "sync the book" or "check for updates" and I'll handle everything automatically.

## Disclaimer

This repository does not contain any source code from Claude Code. All code blocks in original content are pseudocode written to illustrate architectural patterns. The `.reference/` directory is gitignored and contains local-only reference material.

Claude Code is a product of Anthropic. This project is not affiliated with, endorsed by, or sponsored by Anthropic.
