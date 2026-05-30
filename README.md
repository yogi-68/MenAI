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

The **architecture is universal** (direction → initiative → daily task → reflection).  
The **voice** adapts to the user's initiatives — founder language appears only when their data is founder-shaped.

We do **not** optimize for "everyone at once" with generic wellness fluff. We optimize for **people who want to execute consistently** in 1–3 focus areas at a time.

---

## Mental model

```
Direction (goals)        →  long-term outcomes (financial freedom, build wealth)
Active initiatives (≤3)  →  what you execute this month (AI SaaS, fat loss)
Daily plan               →  finishable tasks for TODAY only
Reflection               →  learning loop (what moved, what blocked)
Weekly review            →  narrative longitudinal understanding
Memory timeline (roadmap)→  emotional retention ("April: wanted SaaS → June: first user")
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

**Consistency** — not raw productivity.

Fitness, business, study, and relationships all require showing up repeatedly. Metrics internally track execution rate and consecutive active days; users see **narrative**, not discipline scores.

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

### 8. How many active initiatives?

**Maximum 3 active.** Others must be paused.

Enforced on `POST /api/initiatives`, re-activation via `PATCH`, and accepting suggestions.

---

### 9. Should reports use scores?

**No user-facing scores.** Weekly review is narrative-only.

Bad: `Discipline Score 83`  
Good: *"This week you completed most planned work. The biggest blocker was changing priorities mid-week."*

**Code:** `src/app/dashboard/reports/page.tsx`, `weekly-review-generator.ts`

Admin dashboard may still show TTFT/cost — users never see these.

---

### 10. Real retention feature (roadmap priority)

**Memory Timeline** — not chat alone.

```
April  — Wanted to start SaaS
May    — Defined MVP
June   — Got first user
July   — Lost momentum
August — Recovered
```

Built from goals, initiatives, reflections, weekly reviews. **Next major feature** after initiative wizard.

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
| `src/lib/plans/daily-plan-generator.ts` | AI daily planner |
| `src/lib/plans/initiative-health.ts` | On track / at risk / stalled |
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

1. Apply migrations `supabase/migrations/*.sql` (through `027`).
2. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`
3. Admin: `UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_UUID';`

```bash
npm install && npm run dev
```

Deploy: push to `main` → Vercel auto-deploy.

---

## Principles for contributors

1. **Initiatives drive execution** — goals are direction only.
2. **Tasks must be finishable today** — reject vague lifetime goals as tasks.
3. **Confirm before creating initiatives** — no silent auto-structure.
4. **Max 3 active initiatives** — force focus.
5. **Optimize consistency** — narrative over scores for users.
6. **Show less** — one insight beats seven cards.

---

## License

Private — Yogeshwaran MenAI project.
