# MenAI — Personal Execution OS

MenAI helps ambitious people **execute consistently** across business, career, health, learning, and finance. It turns direction into **3 finishable tasks per active goal per day** and tracks a **Performance Score (0–100)** you can see on Overview.

**Stack:** Next.js 16 · Supabase · OpenAI · Recharts · Vercel  
**UI:** Claymorphism design system · **Plus Jakarta Sans** typography

---

## Quick start

```bash
npm install
cp .env.example .env.local   # fill Supabase + OpenAI keys
npm run dev
```

### Database (required)

1. In Supabase SQL Editor, run migrations in order through **`040`** (`supabase/migrations/*.sql`).
2. Verify with [`supabase/scripts/verify-v2-migrations.sql`](supabase/scripts/verify-v2-migrations.sql).
3. Set env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

See [`SETUP_GUIDE.md`](SETUP_GUIDE.md) for full setup.

---

## How MenAI works

```
Direction goals (context)     →  long-term “where I’m headed”
Execution goals (≤3 active)   →  30–90 day finishable outcomes
Milestones                    →  current step per goal
Today's Plan                  →  exactly 3 tasks per active goal
Performance Score             →  100 when all 3 tasks done; streak-friendly
Overview                      →  goals, charts, weekly/monthly reviews
Intelligence                  →  coach chat + persistent “Who am I?” memory
Timeline                      →  life events and progress history
```

**Performance formula:** each goal gets 3 tasks/day. Complete all 3 → **100** for that goal-day. Partial completion maps to **66 / 33 / 0**. Daily score = average across active goals.

---

## App navigation

| Page | Route | Purpose |
|------|-------|---------|
| **Overview** | `/dashboard` | All goals in clay cards, full analytics charts (area, line, bar, pie, donut, radar, radial), weekly/monthly reviews |
| **Intelligence** | `/dashboard/chat` | Coach chat; pinned identity summary stays visible |
| **Today's Plan** | `/dashboard/plans` | 3 tasks per goal, grouped by goal, tied to milestones |
| **Timeline** | `/dashboard/timeline` | Filterable life history |
| **Settings** | `/dashboard/settings` | Name + theme only |

Click any goal on Overview → **goal analytics** (duration, remaining days, trends, coaching).

---

## What we removed (V2)

- Separate **Initiatives** page (merged into **goals**)
- **Reports** page
- Coaching style toggles (Supportive / Balanced / Direct / Founder mode)
- “What are you moving toward?” settings clutter
- **New Thread** as primary sidebar action
- Weekly/Monthly review as top-level nav (now inside **Overview**)

---

## AI behavior

- **Single real-life coach persona** — tells you what fits today, what doesn’t, and why.
- **Memory:** explicit facts persist; “Who am I?” is synthesized from onboarding, goals, chat, tasks, and patterns (migration `040` adds permanent memory flags).
- **Goals:** max **3 active execution goals**; confirm before creating from chat suggestions.
- **Tasks:** manual checkbox is source of truth; AI never auto-completes.

Key code:

| Area | Path |
|------|------|
| Daily planner | `src/lib/plans/daily-plan-generator.ts` |
| Performance score | `src/lib/plans/performance-score.ts` |
| Active goals (pre/post migration) | `src/lib/goals/active-goals.ts` |
| Orchestrator / coach | `src/lib/ai/orchestrator/` |
| Charts | `src/components/charts/` |
| Clay UI | `src/components/ui/` |

---

## Migrations note

If goals or charts look empty on Overview, run migration **`039_unify_goals.sql`** (unifies initiatives → goals) and **`040_memory_persistence.sql`**, then refresh. The app includes fallbacks for legacy schemas but full V2 requires these migrations.

---

## Principles

1. **Execution goals drive planning** — direction goals are context only.
2. **3 tasks per goal per day** — no vague lifetime tasks.
3. **Confirm before structure** — no silent auto-goals.
4. **Max 3 active execution goals** — force focus.
5. **Show trends** — charts on Overview and goal detail, not vanity metrics.

---

## License

Private — Yogeshwaran MenAI project.
