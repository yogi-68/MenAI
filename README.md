# MenAI — Personal Execution Operating System

MenAI turns long-term direction into **finishable daily actions**. It is not a generic task app or wellness chatbot.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + RLS) · OpenAI · Vercel

---

## Mental model

```
Direction (goals)     →  where you're headed (financial freedom, build wealth)
        ↓
Active initiatives  →  what you're executing now (AI SaaS, fat loss, job search)
        ↓
Daily plan (AI)     →  1–5 tasks finishable TODAY
        ↓
Execution + reflection → weekly narrative review
```

**Rules the product enforces:**

- Goals never become daily tasks directly.
- Daily tasks must pass: *"Can the user finish this before bed?"*
- Plans are generated from **initiatives + opportunities**, not vague goals.

---

## How AI works (by feature)

### 1. Intelligence (chat)

**Path:** `POST /api/chat` → `src/lib/ai/orchestrator/index.ts`

1. **Safety** — crisis detection, escalation to 988 resources when needed.
2. **Emotion + conversation** — parallel; new threads get a server UUID via `X-Conversation-Id`.
3. **Intent + cognitive state** — `cognition-engine.ts` loads goals, initiatives, tasks, patterns.
4. **Memory (RAG)** — pgvector semantic recall via `memory-engine.ts`.
5. **Streaming response** — tokens stream to client; local React state (not Zustand per token).
6. **Background extraction** — `extraction-engine.ts` parses each message:
   - **Goals** → long-term direction (`goals` table)
   - **Projects** → active initiatives (`initiatives` table, 30-day default deadline)
   - **Opportunities** → dated events (`opportunities` table)
   - **Commitments, patterns, relationships** → respective tables

Chat does **not** create daily tasks. It structures what you're working on.

### 2. Today's Plan

**Path:** `GET /api/plans/generate` → `src/lib/plans/daily-plan-generator.ts`

- Runs once per day per user; stores JSON in `daily_plans`.
- Prompt uses **initiatives first**, goals as background only.
- Filters vague tasks via `src/lib/tasks/finishable-today.ts`.
- Inserts `tasks` rows linked to `initiative_id`, `auto_generated: true`, `due_date: today`.
- **Confidence tiers:** low → context-building (1–2 tasks), medium → normal, high → aggressive.

### 3. Home (Today)

**Path:** `GET /api/dashboard/today`

- Today's focus tasks (from plan)
- Active initiative chips
- One insight (observation or execution pattern)
- No momentum score on the home screen

### 4. Weekly Review

**Path:** `GET /api/reports/weekly` → `src/lib/plans/weekly-review-generator.ts`

- Narrative coach summary (4–6 sentences), not scorecards.
- Cached in `weekly_reviews` per week.

### 5. Admin (hidden from users)

**Path:** `/dashboard/admin` — AI cost, TTFT, product funnel. See migrations `022`–`025`.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `src/app/dashboard/` | Authenticated UI: Today, Chat, Plans, Direction & Initiatives, Reports |
| `src/app/api/` | Route handlers (chat, plans, tasks, initiatives, execution) |
| `src/lib/ai/orchestrator/` | Chat pipeline, extraction, cognition, memory, safety |
| `src/lib/plans/` | Daily plan generator, weekly review, initiative health |
| `src/lib/tasks/finishable-today.ts` | Vague-task rejection (shared by API + planner) |
| `src/lib/dashboard/pending-tasks.ts` | Home task selection (today first, dedupe) |
| `supabase/migrations/` | **Source of truth** for schema (ignore legacy `schema.sql`) |

**Removed / unused (do not re-import):** legacy `generate_daily_tasks` SQL (disabled in `018`), old wellness mobile app in `mobile/` (not deployed with web).

---

## Database setup

1. Create a Supabase project.
2. Apply migrations in order: `supabase/migrations/*.sql` (or `supabase db push`).
3. Set env vars (see `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

4. Make yourself admin:

```sql
UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
```

---

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Deployment

- **Frontend + API:** Vercel (connect GitHub `main`).
- **Database:** Supabase hosted project `zshgaiqapgesppcvfnwz` (production).
- Push to `main` triggers Vercel deploy.

---

## Key migrations

| Migration | What |
|-----------|------|
| `019` | Initiatives |
| `020` | Execution system (opportunities, initiative_id on tasks) |
| `021` | Daily reflections, weekly reviews |
| `018` | Disables generic goal→task SQL |
| `026` | Cancels legacy "Make progress on:" tasks |

---

## Product principles (for contributors)

1. **Initiatives drive execution** — if a user only has goals, prompt them to add an initiative.
2. **Tasks must be finishable today** — reject or filter anything else.
3. **Show less, mean more** — one insight beats seven dashboard cards.
4. **Evidence-backed AI** — low confidence → hedged language (`language-guard.ts`).
5. **Admin sees costs** — users never see token usage or TTFT.

---

## License

Private / proprietary — Yogeshwaran MenAI project.
