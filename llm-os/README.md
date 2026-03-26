<div align="center">

# 🧠 LLM OS

**A Stateful, Autonomous AI Agent Operating System**

*114+ tools. One kernel. Zero babysitting.*

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-blueviolet)](https://modelcontextprotocol.io)
[![Gemini](https://img.shields.io/badge/LLM-gemini--2.5--flash--lite-4285F4?logo=google&logoColor=white)](https://ai.google.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br>

<img src="nanobot_arch.png" alt="LLM OS Architecture" width="700"/>

</div>

---

## 💡 What is LLM OS?

LLM OS is a **fully autonomous AI agent** that thinks, plans, and executes multi-step workflows — just like an operating system manages processes, memory, and I/O.

It doesn't just answer questions. It **reads your emails, creates Google Docs, schedules tasks, browses the web, executes shell commands, and manages files** — all through a single natural language prompt.

The core "kernel" is a **FastAPI server** powered by **Gemini 2.5 Flash Lite**, with a dynamic **Agent Loop** that routes prompts through a **Memory Management Unit (MMU)**, selects the right tools via **semantic search (FAISS)**, and executes actions through the **Model Context Protocol (MCP)**.

---

## ✨ Key Features

| | Feature | Description |
|---|---|---|
| 🔁 | **ReAct Agent Loop** | Iterative Reason + Act loop with up to 40 tool-call iterations per request |
| 🧠 | **MMU / ToolRouter** | Domain-based semantic routing (FAISS + sentence-transformers) filters 114+ tools down to the top 12–15 relevant ones per prompt — prevents token overflow |
| 📧 | **Google Workspace MCP** | Native Gmail, Calendar, Docs, Drive, and Tasks integration via the MCP peripheral bus |
| 🔀 | **Subagent Spawning** | Spawn isolated child agents for long-running background tasks |
| ⏰ | **Cron Scheduler** | Schedule recurring AI-driven actions with a built-in cron service |
| 📁 | **Workspace Sandbox** | All file I/O is scoped to an isolated `./workspace/` directory |
| 💾 | **Session Memory** | Persistent conversation history with automatic memory consolidation |
| 🌐 | **Web Tools** | Brave Search integration + raw URL fetching for web research |
| 🔌 | **Multi-Channel** | Supports Telegram, Discord, Slack, WhatsApp, Email, Matrix, and more |
| ☁️ | **Cloud Sync** | Optional Supabase-backed session and memory synchronization |
| 🔑 | **Multi-Provider** | Swap between Gemini, OpenAI, Anthropic, DeepSeek, Groq, and 10+ others via LiteLLM |

---

## 🏗️ Architecture

### Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LLM OS Kernel                                  │
│                                                                             │
│  User Prompt                                                                │
│       │                                                                     │
│       ▼                                                                     │
│  ┌──────────┐    ┌───────────────┐    ┌─────────────────────────────────┐   │
│  │ FastAPI   │───►│  MessageBus   │───►│         Agent Loop              │   │
│  │ /execute  │    │  (pub/sub)    │    │                                 │   │
│  └──────────┘    └───────────────┘    │  1. Build context + history     │   │
│                                       │  2. ToolRouter (FAISS) filters  │   │
│                                       │     114 tools → top 12          │   │
│                                       │  3. LLM decides action          │   │
│                                       │  4. Execute tool(s)             │   │
│                                       │  5. Loop until final answer     │   │
│                                       └──────────┬──────────────────────┘   │
│                                                  │                          │
│                          ┌───────────────────────┼───────────────────┐      │
│                          ▼                       ▼                   ▼      │
│                   ┌────────────┐          ┌────────────┐     ┌──────────┐   │
│                   │   Native   │          │    MCP      │     │  Shell   │   │
│                   │   Tools    │          │  Servers    │     │  Exec    │   │
│                   │            │          │             │     │          │   │
│                   │ • read_file│          │ • Gmail     │     │ • bash   │   │
│                   │ • write    │          │ • Calendar  │     │ • python │   │
│                   │ • web_search          │ • Drive     │     │ • git    │   │
│                   │ • message  │          │ • Docs      │     └──────────┘   │
│                   │ • spawn    │          │ • Tasks     │                    │
│                   └────────────┘          └────────────┘                    │
│                                                                             │
│       ▼                                                                     │
│  Response ──► MessageBus ──► FastAPI ──► Client                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The MMU — Why It Matters

With **114+ registered tools**, sending all tool definitions to the LLM would consume the entire context window. The **ToolRouter (MMU)** solves this:

1. **Indexing** — On boot, every tool's name + description is embedded using `sentence-transformers` and indexed into a FAISS vector store
2. **Query** — When a user prompt arrives, it's embedded and matched against the index
3. **Routing** — Only the **top 12–15 semantically relevant tools** are injected into the LLM's context
4. **Base tools** (filesystem, shell, message) are always included as "kernel-level" utilities

This keeps token usage minimal and prevents context degradation, even on small-context models.

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 20+** (for Google Workspace MCP server)
- **A Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Arpit-Shukla-20233080/LLM-Operating-System.git
cd LLM-Operating-System

# 2. Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# 3. Install dependencies
pip install -e ".[dev]"
```

### Configuration

> [!CAUTION]
> **You MUST create both configuration files before running the server.** The system will crash on boot without them.

```bash
# 4. Create your environment file
cp .env.example .env
#    → Fill in your Google OAuth client ID & secret

# 5. Create your config file
cp config.example.json config.json
#    → Place this at: ~/.nanobot/config.json
#    → Add your Gemini API key in providers.gemini.apiKey
```

The default configuration uses **`gemini/gemini-2.5-flash-lite`** as the LLM provider. You can change this to any supported model (OpenAI, Anthropic, DeepSeek, etc.) by editing `config.json`.

### Boot the Kernel

```bash
# 6. Start the server
python server.py
```

The kernel boots on `http://localhost:8000`. You'll see the MCP peripheral bus mount, tools register, and the FAISS index build in the logs.

### First Request

```bash
curl -X POST http://localhost:8000/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What tools do you have access to?", "user_id": "dev"}'
```

---

## 📖 Example Workflows

### 🔗 Multi-Hop Execution

> **Prompt:** *"Read my latest 5 emails, summarize them into bullet points, create a Google Doc called 'Email Digest', and add a Google Task to review it tomorrow."*

The agent autonomously:
1. Calls `gmail_search_emails` → retrieves 5 emails
2. Synthesizes content → generates bullet-point summary
3. Calls `google_docs_create` → creates the digest document
4. Calls `tasks_create` → schedules a review task with a due date

All in a single prompt — no human intervention between steps.

### ⏰ Scheduled Intelligence

> **Prompt:** *"Every morning at 9 AM, check Hacker News for AI breakthroughs and save a summary to workspace/ai_news.txt"*

The agent:
1. Registers a cron job via the built-in `CronService`
2. At 9 AM daily, the agent fetches HN, filters AI stories, and writes the digest
3. Results persist in the sandboxed `./workspace/` directory

---

## 📂 Project Structure

```
LLM-Operating-System/
├── server.py                  # FastAPI kernel — boot point
├── config.example.json        # Template config (→ ~/.nanobot/config.json)
├── .env.example               # Template env vars (→ .env)
├── bypass_auth.py             # Standalone Google OAuth setup script
├── pyproject.toml             # Python project metadata & dependencies
│
├── nanobot/                   # Core framework
│   ├── agent/
│   │   ├── loop.py            # ReAct Agent Loop (the CPU)
│   │   ├── memory.py          # Memory consolidation & archival
│   │   ├── tool_router.py     # FAISS-based MMU / ToolRouter
│   │   ├── context.py         # Prompt context builder
│   │   ├── subagent.py        # Subagent spawning & lifecycle
│   │   └── tools/
│   │       ├── mcp.py         # MCP client — Google Workspace bridge
│   │       ├── filesystem.py  # Sandboxed file I/O
│   │       ├── shell.py       # Shell command execution
│   │       ├── web.py         # Web search & fetch
│   │       └── ...
│   ├── bus/                   # MessageBus (pub/sub event routing)
│   ├── config/                # Pydantic config schema & loader
│   ├── providers/             # LiteLLM provider registry
│   ├── session/               # Session persistence & history
│   ├── cron/                  # Cron scheduler service
│   └── channels/              # Multi-channel adapters
│
├── bridge/                    # WhatsApp bridge (TypeScript/Baileys)
├── workspace/                 # Sandboxed agent workspace (gitignored)
└── tests/                     # Test suite
```

---

## 🗺️ Roadmap

### ✅ Phase 1 — Kernel (Complete)

- [x] FastAPI server with MessageBus-based agent loop
- [x] FAISS-powered ToolRouter / MMU for dynamic tool filtering
- [x] Google Workspace MCP integration (Gmail, Calendar, Docs, Drive, Tasks)
- [x] Subagent spawning and cron scheduling
- [x] Session memory with automatic consolidation
- [x] Multi-provider LLM support via LiteLLM
- [x] Multi-channel support (Telegram, Discord, Slack, WhatsApp, Email, etc.)

### 🔧 Phase 2 — Web Desktop UI (In Progress)

- [ ] React/Vite-based web desktop interface with window management
- [ ] Draggable, resizable windows with glassmorphism aesthetic
- [ ] Taskbar with app launcher and system tray
- [ ] Terminal app — agent chat with streaming responses
- [ ] Settings app — dynamic config management with hot-reload
- [ ] Google OAuth connect wizard in the UI
- [ ] Desktop file icons from workspace directory
- [ ] File viewer and explorer apps

---

## 🔧 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/execute` | Send a prompt to the agent and receive the response |
| `GET` | `/health` | Server health check and model info |

```bash
# Execute a prompt
curl -X POST http://localhost:8000/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Summarize my latest emails", "user_id": "default"}'

# Health check
curl http://localhost:8000/health
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built by [Arpit Shukla](https://github.com/Arpit-Shukla-20233080)**

*If this project interests you, give it a ⭐ — it helps more than you think.*

</div>
