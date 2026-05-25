# ⚡ MenAI — AI Life Operating System & Execution Coach

**MenAI** is a premium, developer-friendly AI Life Operating System and Execution Coach designed for startup founders, creators, and high performers. It goes beyond wellness chats, functioning as an intelligent partner that tracks your trajectory, maintains accountability, challenges excuse patterns, and monitors momentum.

Built with **Next.js**, **Supabase PostgreSQL**, **pgvector** for long-term memory, and **OpenAI APIs**.

---

## ✨ Features & Capabilities

| Feature | Description |
|---------|-------------|
| 🤖 **AI Mentor** | Conversational coach with memory, adaptive pressure states, and customized coaching styles. |
| 📊 **Command Center** | Minimalist daily dashboard presenting today's priorities, execution momentum, latest strategist insight, and accountability alerts. |
| 🎯 **Automatic Goal Extraction** | Extracts goals, commitments, and relationships automatically from your dialogue. |
| 🔄 **Goals & Tasks Manager** | Track milestones and standalone checklists with built-in recurrence and streak tracking. |
| 🧭 **Life Status Board** | Holistic tracking of commitments (consistency scores), relationships (support network), and accountability history. |
| ⚡ **Energy & Focus** | Log daily energy levels to optimize your performance cycles (rebranded from clinical mood tracking). |
| 📝 **Reflections** | Capture thoughts and get micro-insights on underlying cognitive blocks (rebranded from traditional journaling). |
| 🔋 **Reset & Recovery** | Performance-centered tools (breathing, calming, activation) to recharge focus and prevent burnout. |
| ⚙️ **Execution Settings** | Turn on **Founder Mode**, set your **Life Vision**, and customize coaching styles (`balanced`, `push`, `gentle`, `strategic`). |

---

## 🏗️ AI Orchestration Pipeline

Rather than a simple chat pipeline, MenAI runs a multi-layered **conversational orchestrator** parallel to database operations:

```
                  User Message
                       │
                       ▼
             ┌──────────────────┐
             │  Safety Engine   │ ◄── Rule-based crisis keywords & resources
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  Emotion Engine  │ ◄── Real-time sentiment and body states
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │Extraction Engine │ ◄── Parallel goal, task, & relation parsing
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  State Machine   │ ◄── PLANNING, FOUNDER_COACHING, REFRAMING, etc.
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  Memory Engine   │ ◄── Semantic RAG memories (pgvector)
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │  Accountability  │ ◄── Active commitments & momentum scores
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │    LLM Router    │ ◄── Cost-efficient routing models
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
             └─────────┬────────┘
                       │
                       ▼
             ┌──────────────────┐
             │    Validator     │ ◄── Safety check and persistence filters
             └──────────────────┘
```

---

## 🛠️ Database Setup (Supabase)

MenAI relies on Supabase for data management and vector similarity search. Follow these steps to configure your database:

### 1. Base Schema Setup
1. Go to your **Supabase Dashboard** -> **SQL Editor**.
2. Paste the contents of `supabase/schema.sql` and click **Run**.
3. This sets up base profiles, conversations, messages, mood entries, and enabling the `vector` extension.

### 2. Life OS Migration (CRITICAL 🚨)
1. In the **SQL Editor**, open a new query tab.
2. Paste the contents of `supabase/migration_life_os.sql` and click **Run**.
3. This creates the OS infrastructure: `goals`, `tasks`, `commitments`, `relationships`, `daily_plans`, and `accountability_log` tables, updates constraints, adds profile fields (`vision`, `founder_mode`, `coaching_style`), and deploys RLS policy rules.

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
Open [http://localhost:3000](http://localhost:3000) and sign up to access your Command Center!

---

## 📁 Key File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # Conversational orchestrator stream
│   │   ├── goals/route.ts             # Goals CRUD
│   │   ├── tasks/route.ts             # Task updates
│   │   └── mood/route.ts              # Energy log submission
│   ├── dashboard/
│   │   ├── page.tsx                   # Simplified Command Center Dashboard
│   │   ├── chat/page.tsx              # AI Mentor chat view
│   │   ├── goals/page.tsx             # Goals and Standalone Tasks
│   │   ├── status/page.tsx            # Life Status board (Commitments & People)
│   │   ├── settings/page.tsx          # Founder Mode and Coaching style options
│   │   └── mood/page.tsx              # Energy & Focus logger
│   └── page.tsx                       # Branding Landing Hero
├── lib/
│   ├── ai/
│   │   ├── orchestrator/              # AI Orchestration Module
│   │   │   ├── index.ts               # Core orchestration execution
│   │   │   ├── prompt-builder.ts      # Prompt injection with user settings
│   │   │   ├── accountability-engine.ts# Follow-up prompts & consistency scores
│   │   │   ├── extraction-engine.ts   # Auto-extract parameters from chat
│   │   │   └── regulation-engine.ts   # Focus, Scattered, Burnout state behaviors
│   │   └── prompts.ts                 # Master System prompts
```

---

## 🔒 Safety & Moderation
- **Row Level Security (RLS)** is enabled on every table to isolate user data.
- **Rules-based & AI Moderation**: Parallel keywords and OpenAI safety scans prevent inappropriate usage.
- **Grounding and Crisis Trigger**: Instant redirection to help hotlines if safety limits are exceeded.

---

## 📄 License
MIT
