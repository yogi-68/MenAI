# 🧠 MenAI

**Production-grade AI mental wellness platform** — built with Next.js 15, Supabase, and OpenAI GPT-4o.

Talk to an empathetic AI, track your mood, journal with AI insights, practice CBT exercises, and meditate — all in one secure, private platform.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Chat** | Compassionate conversations with emotional intelligence, memory, and state-aware responses |
| 📊 **Mood Tracking** | Log daily mood with emotions, energy, sleep. Beautiful timeline visualizations |
| 📝 **Smart Journal** | Write freely → get AI-generated insights and sentiment analysis |
| 🧠 **CBT Exercises** | Guided cognitive behavioral therapy (Thought Records, Grounding, Behavioral Activation) |
| 🧘 **Meditation** | Guided sessions for sleep, anxiety, self-compassion + breathing exercises |
| 🌗 **Day / Night Theme** | Toggle between dark and light mode with one click |
| 🚨 **Crisis Support** | Multi-layer safety system with emergency resource escalation |
| 🔐 **Privacy First** | End-to-end encryption, Row Level Security, HIPAA-aligned practices |

---

## 🏗️ AI Architecture

MenAI uses a **production-grade orchestrator** instead of a simple Frontend → API → OpenAI pipeline:

```
User Message
     ↓
┌─────────────────────────┐
│    AI ORCHESTRATOR       │
├─────────────────────────┤
│ 1. Safety Engine         │ ← Multi-layer: Keywords + OpenAI Moderation + Emotional Intensity
│ 2. Emotion Engine        │ ← Real-time emotional analysis (LLM-based)
│ 3. State Machine         │ ← LISTENING → VALIDATING → EXPLORING → REFRAMING → GROUNDING
│ 4. Memory Engine         │ ← Short-term + Long-term + Episodic + Emotional (pgvector RAG)
│ 5. LLM Router            │ ← Cost-optimized: cheap/standard/premium model selection
│ 6. Prompt Builder        │ ← Dynamic context-aware prompt construction
│ 7. LLM Call              │ ← GPT-4o or GPT-4o-mini based on context
│ 8. Response Validator    │ ← No diagnosis, no meds, no human claims, length check
│ 9. Memory Storage        │ ← Conversation summaries + memory compression
└─────────────────────────┘
     ↓
AI Response
```

### Conversation States

The AI uses a **state machine** to determine what mode to be in:

| State | When | Behavior |
|-------|------|----------|
| `LISTENING` | Default | Absorb, reflect, ask one gentle question |
| `VALIDATING` | High emotion detected | Validate feelings only, no advice yet |
| `EXPLORING` | After validation | Ask deeper questions to understand |
| `REFRAMING` | Negative thought patterns | Gently challenge distortions (CBT) |
| `GROUNDING` | Panic/anxiety signals | Immediate grounding exercises |
| `GOAL_SETTING` | User asks for help | Small, actionable steps |
| `REFLECTION` | Progress/gratitude | Acknowledge growth |
| `ESCALATION` | Crisis detected | Safety resources + empathy |

### Cost Optimization

| Model | Used For | Cost |
|-------|----------|------|
| `gpt-4o-mini` | Classification, summaries, casual chat | ~$0.15/1M tokens |
| `gpt-4o` | High-emotion, crisis, reframing | ~$2.50/1M tokens |

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, TailwindCSS
- **State**: Zustand
- **Database**: Supabase PostgreSQL + pgvector (RAG memory)
- **Auth**: Supabase Auth (Email + Google OAuth)
- **AI**: OpenAI GPT-4o / GPT-4o-mini
- **Deployment**: Vercel + Supabase Cloud

---

## 🚀 Quick Start

### Prerequisites

- [Node.js 18+](https://nodejs.org)
- [Supabase account](https://supabase.com) (free tier works)
- [OpenAI API key](https://platform.openai.com/api-keys)

### 1. Clone & Install

```bash
git clone https://github.com/yogi-68/MenAI.git
cd MenAI
npm install
```

### 2. Environment Variables

Create `.env.local` in the root:

```env
# Supabase (Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key
```

> **Note:** We do NOT use Pinecone. Memory/RAG uses **pgvector** (built into Supabase) — zero extra cost.

### 3. Set Up Database

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. Paste the contents of `supabase/schema.sql`
3. Click **Run** — creates all tables, RLS policies, triggers, and indexes

### 4. Enable Auth Providers

In Supabase Dashboard → Authentication → Providers:
- ✅ **Email** (enabled by default)
- ✅ **Google** (optional — needs OAuth credentials from [Google Cloud Console](https://console.cloud.google.com))

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Sign up → Start chatting!

---

## 🌐 Deploy to Vercel

### Root Directory

When Vercel asks for root directory: **leave it as `.` (root)**. Do NOT set a subdirectory.

### Steps

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your `MenAI` repository
4. **Root Directory**: Leave as `.` (default)
5. **Framework**: Next.js (auto-detected)
6. **Environment Variables** — add these 4:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
7. Click **Deploy** — live in ~60 seconds!

### What about `node_modules`?

**NO.** Never push `node_modules` to git. It's in `.gitignore`. Vercel automatically runs `npm install` during build to recreate it.

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts              # Chat API (uses Orchestrator)
│   │   ├── conversations/             # Conversation CRUD
│   │   ├── journal/route.ts           # Journal + AI insights
│   │   └── mood/route.ts              # Mood tracking
│   ├── auth/callback/route.ts         # OAuth callback
│   ├── dashboard/
│   │   ├── layout.tsx                 # Sidebar + theme toggle
│   │   ├── page.tsx                   # Dashboard overview
│   │   ├── chat/page.tsx              # AI chat interface
│   │   ├── mood/page.tsx              # Mood tracker
│   │   ├── journal/page.tsx           # Journal
│   │   ├── exercises/page.tsx         # CBT exercises
│   │   └── meditation/page.tsx        # Guided meditation
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── page.tsx                       # Landing page
├── lib/
│   ├── ai/
│   │   ├── orchestrator/              # ★ THE BRAIN ★
│   │   │   ├── index.ts               # Main orchestrator pipeline
│   │   │   ├── router.ts              # LLM model selection
│   │   │   ├── memory-engine.ts       # Multi-tier memory + summarization
│   │   │   ├── emotion-engine.ts      # Emotion detection
│   │   │   ├── safety-engine.ts       # Multi-layer safety pipeline
│   │   │   ├── state-machine.ts       # Conversational state management
│   │   │   ├── prompt-builder.ts      # Dynamic prompt construction
│   │   │   ├── response-validator.ts  # Output safety checks
│   │   │   └── types.ts               # Shared type definitions
│   │   ├── openai.ts                  # OpenAI client + embeddings
│   │   ├── prompts.ts                 # System prompts
│   │   ├── crisis-detection.ts        # Crisis keyword detection
│   │   └── memory.ts                  # Legacy memory (kept for compatibility)
│   ├── supabase/                      # Supabase clients
│   ├── store.ts                       # Zustand state
│   └── utils.ts                       # Utilities
supabase/
└── schema.sql                         # Complete DB schema
```

---

## 🧠 Do I Need Fine-Tuning?

**No.** MenAI uses **prompt engineering + orchestration** instead of fine-tuning:

| Approach | Status |
|----------|--------|
| System Prompt Engineering | ✅ Done — deeply refined for empathy |
| Conversation State Machine | ✅ Done — 8 therapeutic states |
| Cost-Optimized Model Routing | ✅ Done — cheap model for simple tasks |
| Memory Compression | ✅ Done — summarizes every 20 messages |
| Response Validation | ✅ Done — no diagnosis, no meds, no human claims |

Fine-tuning is only needed after collecting 1000+ real conversation examples.

---

## 📱 Mobile App

The web app is fully responsive. For a native app:
- Use **React Native + Expo** sharing the same Supabase backend
- Same env vars, same database, same API

---

## 🔒 Security

- **Row Level Security** on every table
- **Server-side auth** — no client-side token exposure
- **Multi-layer safety** — keyword detection + OpenAI moderation + emotional assessment
- **Response validation** — no diagnosis, no medication advice, no human impersonation
- **Crisis protocol** — emergency resources always available
- **Content moderation** — OpenAI moderation API on all inputs

---

## ⚠️ Disclaimer

MenAI is an AI wellness companion and is **NOT a substitute for professional medical advice, diagnosis, or treatment**. If you are in crisis, please call **988** (Suicide & Crisis Lifeline) or text **HELLO** to **741741** (Crisis Text Line).

---

## 📄 License

MIT
