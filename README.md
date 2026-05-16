# 🧠 MindfulAI

**AI-powered mental wellness companion** — built with Next.js 15, Supabase, and OpenAI GPT-4o.

Talk to an empathetic AI, track your mood, journal with AI insights, practice CBT exercises, and meditate — all in one secure, private platform.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Chat** | Compassionate conversations powered by GPT-4o with emotional intelligence, memory, and context awareness |
| 📊 **Mood Tracking** | Log daily mood with emotions, energy, sleep. Beautiful timeline visualizations |
| 📝 **Smart Journal** | Write freely → get AI-generated insights and sentiment analysis |
| 🧠 **CBT Exercises** | Guided cognitive behavioral therapy (Thought Records, Grounding, Behavioral Activation) |
| 🧘 **Meditation** | Guided sessions for sleep, anxiety, self-compassion + breathing exercises |
| 🚨 **Crisis Support** | Multi-layer safety system with emergency resource escalation |
| 🔐 **Privacy First** | End-to-end encryption, Row Level Security, HIPAA-aligned practices |

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, TailwindCSS
- **State**: Zustand
- **Database**: Supabase PostgreSQL + pgvector (RAG memory)
- **Auth**: Supabase Auth (Email + Google OAuth)
- **AI**: OpenAI GPT-4o + text-embedding-3-small
- **Deployment**: Vercel + Supabase Cloud

---

## 🚀 Quick Start

### Prerequisites

- [Node.js 18+](https://nodejs.org)
- [Supabase account](https://supabase.com) (free tier works)
- [OpenAI API key](https://platform.openai.com/api-keys)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/MindfulAI.git
cd MindfulAI
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

### 3. Set Up Database

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. Paste the contents of `supabase/schema.sql`
3. Click **Run** — creates all tables, RLS policies, triggers, and seed data

### 4. Enable Auth Providers

In Supabase Dashboard → Authentication → Providers:
- ✅ Enable **Email** (enabled by default)
- ✅ Enable **Google** (optional — needs OAuth credentials from [Google Cloud Console](https://console.cloud.google.com))

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Sign up → Start chatting!

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # AI chat pipeline (10-step)
│   │   ├── conversations/          # Conversation CRUD
│   │   ├── journal/route.ts        # Journal + AI insights
│   │   └── mood/route.ts           # Mood tracking
│   ├── auth/callback/route.ts      # OAuth callback
│   ├── dashboard/
│   │   ├── layout.tsx              # Sidebar navigation
│   │   ├── page.tsx                # Dashboard overview
│   │   ├── chat/page.tsx           # AI chat interface
│   │   ├── mood/page.tsx           # Mood tracker
│   │   ├── journal/page.tsx        # Journal
│   │   ├── exercises/page.tsx      # CBT exercises
│   │   └── meditation/page.tsx     # Guided meditation
│   ├── login/page.tsx              # Login
│   ├── signup/page.tsx             # Signup
│   └── page.tsx                    # Landing page
├── lib/
│   ├── ai/
│   │   ├── openai.ts               # OpenAI client
│   │   ├── prompts.ts              # System prompts (emotional intelligence)
│   │   ├── crisis-detection.ts     # Safety system
│   │   └── memory.ts               # RAG memory (pgvector)
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   ├── server.ts               # Server client
│   │   └── middleware.ts           # Auth middleware
│   ├── store.ts                    # Zustand state
│   └── utils.ts                    # Utilities
supabase/
└── schema.sql                      # Complete DB schema
```

---

## 🧠 Do I Need to Fine-Tune OpenAI?

**No.** This project uses **prompt engineering** (not fine-tuning) to get great results. Here's why:

| Approach | When to Use |
|----------|-------------|
| **Prompt Engineering** ✅ | Works great for most cases. Our detailed system prompt handles emotional intelligence, safety, and conversation style |
| **Fine-Tuning** | Only needed if you have 1000+ curated therapy conversation examples and need specialized behavior that prompts can't achieve |

The system prompt in `src/lib/ai/prompts.ts` is deeply refined to:
- Validate feelings before offering suggestions
- Never minimize pain or rush to fix
- Apologize properly when wrong
- Recognize emotional patterns
- Maintain appropriate safety boundaries

You can improve responses further by:
1. Adjusting the system prompt in `prompts.ts`
2. Tuning `temperature` (0.8) and `max_tokens` (500) in `api/chat/route.ts`
3. Adding more crisis detection patterns in `crisis-detection.ts`

---

## 🌐 Deploy to Vercel

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your repository
4. Add environment variables (same as `.env.local`)
5. Deploy — your app is live!

---

## 📱 Mobile App

The web app is fully responsive and works on mobile browsers. For a native app:
- Use **React Native + Expo** sharing the same Supabase backend
- The API routes and database work identically for both web and mobile

---

## 🔒 Security

- **Encrypted at rest** via Supabase
- **Row Level Security** on every table
- **Server-side auth** — no client-side token exposure
- **Crisis protocol** — emergency resources always available
- **No diagnosis** — AI never makes medical claims
- **Content moderation** — OpenAI moderation API on all inputs

---

## ⚠️ Disclaimer

MindfulAI is an AI wellness companion and is **NOT a substitute for professional medical advice, diagnosis, or treatment**. If you are in crisis, please call **988** (Suicide & Crisis Lifeline) or text **HELLO** to **741741** (Crisis Text Line).

---

## 📄 License

MIT
