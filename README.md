# ⚡ MenAI — AI Life Operating System & Execution Coach

**MenAI** is a premium, developer-friendly AI Life Operating System and Execution Coach designed for startup founders, creators, and high performers. 

It functions as an intelligent strategic partner that tracks your trajectory, maintains strict accountability, challenges excuse patterns, and monitors your execution momentum.

Built with **Next.js**, **Supabase PostgreSQL**, **pgvector** for long-term memory, and **OpenAI APIs**.

---

## ✨ Core Systems & Capabilities

| Feature | Description |
|---------|-------------|
| 🤖 **AI Mentor** | Conversational execution coach with deep memory, adaptive pressure states, and customized coaching styles. |
| 📊 **Command Center** | Minimalist daily dashboard presenting today's priorities, execution momentum, latest strategist insight, and accountability alerts. |
| 🎯 **Silent Extraction Engine** | Extracts goals, commitments, and projects automatically from your dialogue. No manual data entry required. |
| 🔄 **Goals & Tasks Manager** | Track milestones, manage execution checklists, and maintain daily momentum. |
| 🧭 **Life Status Board** | Holistic tracking of active commitments (consistency scores) and structural accountability. |
| ⚙️ **Execution Settings** | Turn on **Founder Mode**, set your **Life Vision**, and customize coaching styles (`balanced`, `push`, `gentle`, `strategic`). |

---

## 🏗️ Intelligence Orchestration Pipeline

MenAI runs a multi-layered **conversational orchestrator** parallel to database operations, fundamentally changing how the AI interacts based on context:

```
                  User Message
                       │
                       ▼
             ┌──────────────────┐
             │  Intent Engine   │ ◄── Classifies PLANNING, GOAL_DECLARATION, etc.
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │Extraction Engine │ ◄── Parallel goal, task, & project parsing
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  State Machine   │ ◄── PLANNING, FOUNDER_COACHING, STRATEGIC_THINKING
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  Memory Engine   │ ◄── Semantic RAG memories (pgvector)
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  Accountability  │ ◄── Checks active commitments & missing progress
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  Prompt Builder  │ ◄── Injects vision, settings, state & style
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │    LLM Stream    │ ◄── Progressive token responses
             └──────────────────┘
```

---

## 🛠️ Database Setup (Supabase)

MenAI relies on Supabase for data management and vector similarity search. Follow these steps to configure your database:

### 1. Base Schema Setup
1. Go to your **Supabase Dashboard** -> **SQL Editor**.
2. Paste the contents of `supabase/schema.sql` and click **Run**.
3. This sets up the pure Life OS infrastructure: `profiles`, `conversations`, `messages`, `goals`, `tasks`, `commitments`, `memories` (vector DB), and enables Row Level Security.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js 18+](https://nodejs.org)
- A [Supabase account](https://supabase.com) (free tier is sufficient)
- An [OpenAI API key](https://platform.openai.com)

### 1. Installation
```bash
git clone https://github.com/yogi-68/MentalAI.git
cd MentalAI
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root folder and configure:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-key
```

### 3. Local Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign up to access your Command Center.

---

## 📁 Key File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # Conversational orchestrator stream
│   │   ├── goals/route.ts             # Goals CRUD
│   │   └── tasks/route.ts             # Task updates
│   ├── dashboard/
│   │   ├── page.tsx                   # Command Center Dashboard
│   │   ├── chat/page.tsx              # AI Mentor chat view
│   │   ├── goals/page.tsx             # Execution tasks & goals
│   │   ├── status/page.tsx            # Life Status & Commitments
│   │   └── settings/page.tsx          # Founder Mode and Coaching style options
│   └── page.tsx                       # Branding Landing Hero
├── lib/
│   ├── ai/
│   │   ├── orchestrator/              # AI Orchestration Module
│   │   │   ├── index.ts               # Core orchestration execution
│   │   │   ├── prompt-builder.ts      # Prompt injection with user settings
│   │   │   ├── accountability-engine.ts# Follow-up prompts & consistency scores
│   │   │   ├── extraction-engine.ts   # Auto-extract parameters from chat
│   │   │   └── state-machine.ts       # Execution states (PLANNING, STRATEGY)
│   │   └── prompts.ts                 # Master System prompts
```

---

## 📄 License
MIT
