# MenAI — Personal Execution Operating System

MenAI turns long-term direction into **finishable daily actions** and optimizes for **consistency**, not productivity theater.

**Stack:** Next.js · Supabase · OpenAI · Vercel

---

## Who MenAI is for (explicit decision)

**MenAI is for ambitious people executing across life domains** — not only founders.

| Domain | Example initiative |
|--------|-------------------|
| Business | Launch AI SaaS MVP |
| Career | UPSC preparation / job search |
| Health | Fat loss, calisthenics |
| Finance | Recurring income systems |
| Learning | Content creation, skills |

The **architecture is universal** (direction → active goal → 3 daily tasks → reflection).  
MenAI uses a **single execution-focused mentor persona** — no coaching style toggles.

We do **not** optimize for "everyone at once" with generic wellness fluff. We optimize for **people who want to execute consistently** with up to **3 active goals** at a time.

---

## Mental model

```
Direction goals            →  long-term context (goal_kind = direction)
Active execution goals (≤3) →  what you execute this month (goal_kind = execution)
Daily plan                 →  exactly 3 tasks per active goal
Performance score          →  0–100 based on task completion (66/33/0 per goal-day)
Reflection                 →  learning loop (what moved, what blocked)
Weekly / Monthly review    →  analytics + coach narrative
Life timeline              →  visual history with filters and search
```

---

## Product architecture decisions

These answers govern what we build next. Implemented items reference code paths.

### 1. AI memory confidence rule

| Signal | Action |
|--------|--------|
| Explicit user statement (confidence ≥ 0.75) | Save immediately to core tables |
| Tentative / low confidence (< 0.75) | Queue in `ai_suggestions` — user confirms |
| Repeated mention (future) | Bump confidence + occurrences |
| Contradicting behavior (future) | Reduce confidence / archive |

**Code:** `src/lib/product/constants.ts` (`MEMORY_CONFIDENCE`), `src/lib/ai/memory-confidence.ts`, `extraction-engine.ts`

---

### 2. Should users edit AI memories?

**Yes — via archive, not silent overwrite.**

When identity direction shifts (e.g. "I'm a founder" → "I'm preparing for UPSC"):
- Archive prior `identity_signals` (`status: archived`)
- Insert new active signal

User-facing edit UI is roadmap; archive-on-contradiction is live.

---

### 3. How proactive should MenAI be?

**Moderate — max 3 touchpoints per day.** No push spam in v1.

| Phase | Behavior |
|-------|----------|
| Morning | Today's plan / focus (`/api/rhythm`, `/api/plans/generate`) |
| Afternoon | Execution check-in prompt (rhythm API) |
| Night | Reflection prompt (plans page) |

Passive chat always available. Push notifications = future, opt-in only.

**Code:** `src/app/api/rhythm/route.ts`, `DAILY_AI_TOUCHPOINTS` in constants

---

### 4. What is task completion?

**Manual checkbox is source of truth.** AI may infer confidence signals from chat but never auto-completes tasks.

- User checks task on Today / Plans
- `PATCH /api/tasks` records completion + optional actual minutes
- Chat may note "I finished X" → memory only, not auto-check

---

### 5. Should MenAI create initiatives automatically?

**No — always confirm first.**

Chat extraction queues initiatives in `ai_suggestions`. Home shows:

```
Detected initiative: Launch AI SaaS MVP
[Create] [Dismiss]
```

**Code:** `ai_suggestions` table (migration `027`), `/api/suggestions`, `AiSuggestionsBanner`

---

### 6. What is MenAI optimizing?

**Consistency via visible Performance Score (0–100).**

Each active goal gets 3 planned tasks per day. Daily score = average completion across goals (100 / 66 / 33 / 0). Weekly and monthly scores roll up automatically. Shown on Overview, goal analytics, and review pages.

**Code:** `src/lib/plans/performance-score.ts`, `/api/analytics/*`

---

### 7. What should the AI detect?

**~10–15 patterns max**, grouped as:

| Category | Patterns |
|----------|----------|
| Execution | procrastination, overthinking, perfectionism, inconsistency, scattered_focus, avoidance |
| Energy | burnout |
| Direction | goal switching, commitment drift (via initiatives + reflections) |

**Code:** `ALLOWED_EXECUTION_PATTERNS` in `src/lib/product/constants.ts`, extraction prompt

---

### 8. How many active goals?

**Maximum 3 active execution goals.** Others must be paused.

Enforced on `POST /api/goals` (goal_kind=execution), re-activation via `PATCH`, and accepting suggestions.

---

### 9. Weekly & Monthly reviews

**Analytics + narrative** — not a separate Reports page.

- `/dashboard/reviews/weekly` — score trends, completion charts, coach summary
- `/dashboard/reviews/monthly` — life-area radar, goal comparison

**Code:** `src/app/api/analytics/reviews/weekly/route.ts`, review pages under `src/app/dashboard/reviews/`

---

### 10. Life Timeline (shipped)

**Life Timeline** — `/dashboard/timeline`

Visual timeline with filters, search, and category analytics. Events include goal created, milestones, habits, reflections, weekly wins, course corrections, and achievements.

**Code:** `src/lib/plans/memory-timeline.ts`, `/api/memory/timeline`, `/api/analytics/timeline`

---

### 11. Initiative milestones + current focus

Each initiative gets AI-generated milestones on create (Define problem → Build MVP → First user → Launch).

**Priority stack for daily plans:**

```
Opportunity (urgent)
  ↓
Current focus initiative → active milestone
  ↓
Other initiative milestones
  ↓
Routine tasks
```

**Current focus:** one active initiative on `profiles.current_focus_initiative_id`. Set from Direction & Initiatives page. Home shows focus + narrative health (At Risk — No meaningful progress in 7 days).

**Code:** migration `028`, `/api/milestones`, `/api/focus`, `milestone-generator.ts`

---

### 12. Daily planner loop

| Phase | Behavior |
|-------|----------|
| Morning | Generate plan — "What's the most important thing today?" |
| Midday | `/api/plans/adjust` — replan afternoon from completed tasks |
| Night | Reflection on Daily Plans page — feeds tomorrow's plan |

**Code:** `/api/rhythm`, `adjustMiddayPlan()`, plans page rhythm banner

---

### 13. Task generation uses weaknesses

Execution patterns map to anti-tasks and preferred tasks (e.g. overthinking → "Talk to 1 user", not "Research competitors"). Every generated task includes **Why?** with user-specific evidence.

**Code:** `pattern-task-guidance.ts`, updated `daily-plan-generator.ts` prompt

---

### 14. Positioning

**A — Personal growth system** (fitness, career, business, study, relationships, finance) with **execution + consistency** as the core engine underneath. Same architecture for a founder, student, or someone losing weight.

---

## How AI works (by feature)

### Intelligence (chat)

`POST /api/chat` → orchestrator pipeline:

1. Safety → 2. Emotion + conversation → 3. Cognitive state → 4. Memory RAG → 5. Stream LLM → 6. Background extraction

Extraction writes:
- **Direction** → `goals` (if confident) or suggestion queue
- **Initiatives** → always `ai_suggestions` (confirm first)
- **Opportunities** → suggestion queue (auto-save only if dated + confidence ≥ 0.92)
- **Patterns, commitments, relationships** → respective tables

### Today's Plan

`GET /api/plans/generate` — initiatives + opportunities → AI → finishable tasks only (`finishable-today.ts`).

### Home (Today)

`GET /api/dashboard/today` — focus tasks, initiatives, one insight, suggestion banner.

### Weekly Review

Narrative coach summary, cached per week.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `src/lib/product/constants.ts` | Architecture constants (max initiatives, confidence, patterns) |
| `src/lib/ai/memory-confidence.ts` | Confidence gates, suggestion queue, identity archive |
| `src/lib/tasks/finishable-today.ts` | "Can you finish this today?" validation |
| `src/lib/plans/performance-score.ts` | Daily/weekly/monthly Performance Score |
| `src/lib/plans/daily-plan-generator.ts` | AI daily planner (3 tasks per goal) |
| `src/lib/plans/goal-health.ts` | On track / at risk / stalled |
| `src/app/api/analytics/` | Dashboard analytics APIs |
| `src/app/api/suggestions/` | Confirm/dismiss AI-detected initiatives |
| `supabase/migrations/` | Schema source of truth |

---

## Roadmap (must-have next)

| Feature | Status |
|---------|--------|
| Initiative health (on track / at risk / stalled) | ✅ Shipped |
| AI daily planner | ✅ Shipped |
| AI weekly review (narrative) | ✅ Shipped |
| Initiative confirm flow | ✅ Shipped (this release) |
| Max 3 active initiatives | ✅ Shipped |
| Memory timeline UI | 🔜 Next |
| Initiative creation wizard (AI milestones) | 🔜 Next |
| Task evolution | 🔄 Improving |
| User memory edit UI | 🔜 Planned |

---

## Database setup

1. Apply migrations `supabase/migrations/*.sql` in order through **`040`**, then run [`supabase/scripts/verify-v2-migrations.sql`](supabase/scripts/verify-v2-migrations.sql) in the SQL Editor.
2. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`
3. Admin: `UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_UUID';`

```bash
npm install && npm run dev
```

Deploy: push to `main` → Vercel auto-deploy.

---

## Principles for contributors

1. **Execution goals drive planning** — direction goals are context only (`goal_kind`).
2. **Tasks must be finishable today** — reject vague lifetime goals as tasks.
3. **Confirm before creating goals** — no silent auto-structure.
4. **Max 3 active execution goals** — force focus.
5. **Performance Score (0–100)** — 3 tasks per goal per day; visible on dashboard.
6. **Show less** — one insight beats seven cards.

---

## License

Private — Yogeshwaran MenAI project.
