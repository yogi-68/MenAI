# MenAI ? Personal Execution OS

MenAI is an **execution OS for ambitious people**: a dark, Linear-style dashboard with a persistent performance score, exactly **3 AI-generated tasks per active goal per day**, and a single execution-focused coach that remembers who you are.

**Stack:** Next.js 16 ? Supabase ? OpenAI ? Upstash Redis ? Recharts ? Vercel  
**Design:** `#0f0f11` shell ? `#7c6fff` accent ? **Syne** (display headings) ? **Plus Jakarta Sans** (UI body) ? **JetBrains Mono** (numeric score only)  
**Layout:** 3 columns ? sidebar (score + nav) | main content | Coach rail (hidden on `/dashboard/chat` and on mobile)

---

## Table of contents

1. [Launch readiness](#launch-readiness-first-external-user)
2. [Quick start](#quick-start)
3. [Environment variables](#environment-variables)
4. [Onboarding flow (step-by-step)](#onboarding-flow-step-by-step)
5. [User journey after onboarding](#user-journey-after-onboarding)
6. [Architecture & data flow](#architecture--data-flow)
7. [Typography & spacing](#typography--spacing)
8. [Project structure](#project-structure)
9. [Feature map](#feature-map)
10. [Product rules](#product-rules)
11. [How AI is used](#how-ai-is-used)
12. [Database reference](#database-reference)
13. [API routes](#api-routes)
14. [Key modules (`src/lib`)](#key-modules-srclib)
15. [UI components (`src/components`)](#ui-components-srccomponents)
16. [Deploy (Vercel)](#deploy-vercel)
17. [Scripts & verification](#scripts--verification)
18. [Testing](#testing)
19. [Scaling notes](#scaling-notes)

---

## Launch readiness (first external user)

The product is code-complete for a single beta user. Operational blockers:

| Blocker | Action |
|---------|--------|
| Database | Run Supabase migrations **001 through 042** on production |
| Env vars | Set Supabase, OpenAI, Redis (prod cache), Resend, `CRON_SECRET` on Vercel |
| Nightly cron | Schedule `GET /api/cron/nightly` with `Authorization: Bearer $CRON_SECRET` |
| User path | Signup ? onboarding ? at least one **execution goal with a deadline** |

Verify schema after migrate: [`supabase/scripts/verify-v2-migrations.sql`](supabase/scripts/verify-v2-migrations.sql)

---

## Quick start

```bash
npm install
cp .env.local.example .env.local
# Fill in Supabase + OpenAI keys
npm run dev
```

Apply migrations (CLI recommended):

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Open `http://localhost:3000` ? Sign up ? complete onboarding ? land on dashboard.

---

## Environment variables

Copy from [`.env.local.example`](.env.local.example):

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server/orchestrator writes |
| `OPENAI_API_KEY` | Yes | Plans + coach |
| `OPENAI_FAST_MODEL` | No | Default `gpt-4o-mini` (planner, extraction) |
| `OPENAI_DEEP_MODEL` | No | Default `gpt-4o` (coach, milestones, reviews) |
| `ENABLE_PREDICTIONS` | No | Set `true` to write `behavioral_predictions` (default off) |
| `UPSTASH_REDIS_REST_URL` | Prod | Session + user-context cache |
| `UPSTASH_REDIS_REST_TOKEN` | Prod | Session + user-context cache |
| `RESEND_API_KEY` | Yes | Auth emails |
| `NEXT_PUBLIC_APP_URL` | Yes | Email links |
| `CRON_SECRET` | Prod | Protects `/api/cron/nightly` |

Without Redis, caching is disabled gracefully ? the app still works but rebuilds context from Supabase on every request.

---

## Onboarding flow (step-by-step)

Onboarding is a **one-question-at-a-time** questionnaire. It runs at `/onboarding` and is gated by `onboarding_progress.completed_at` ? the dashboard redirects incomplete users back to onboarding.

### Files involved

| File | Role |
|------|------|
| [`src/app/onboarding/page.tsx`](src/app/onboarding/page.tsx) | UI: question cards, progress bar, validation |
| [`src/lib/onboarding/questions.ts`](src/lib/onboarding/questions.ts) | Question definitions + flow order |
| [`src/app/api/onboarding/answer/route.ts`](src/app/api/onboarding/answer/route.ts) | Saves each answer to `onboarding_responses` |
| [`src/app/api/onboarding/progress/route.ts`](src/app/api/onboarding/progress/route.ts) | Returns current step / completion |
| [`src/app/api/onboarding/validate-initiative/route.ts`](src/app/api/onboarding/validate-initiative/route.ts) | Blocks vague goals before continue |
| [`src/app/api/onboarding/finalize/route.ts`](src/app/api/onboarding/finalize/route.ts) | SSE finalize with step progress |
| [`src/components/onboarding/finalize-progress.tsx`](src/components/onboarding/finalize-progress.tsx) | 4-step setup tracker UI |
| [`src/lib/ai/onboarding-extraction.ts`](src/lib/ai/onboarding-extraction.ts) | Optional LLM extraction for selected answers |

### Question flow (5 steps)

Defined in [`questions.ts`](src/lib/onboarding/questions.ts) ? `buildQuestionFlow()` returns `["Q2", "Q3", "Q4", "Q7", "Q5"]`:

| Step | Label | ID | Question | Type | What it creates |
|------|-------|-----|----------|------|-----------------|
| 1 | Goal | **Q2** | What are you actively trying to achieve in the next 30?90 days? | Text | Execution goal title (accept-and-sharpen, not hard block) |
| 2 | Deadline | **Q3** | When do you want to achieve this? | Forced choice | `target_date` (null = week-relative milestones) |
| 3 | Obstacle | **Q4** | What is the biggest thing slowing you down? | Forced choice | `execution_patterns` row |
| 4 | Success | **Q7** | What would make the next 30 days successful? | Text (must include number or measurable noun) | `success_criteria` |
| 5 | Time | **Q5** | How many hours per week can you dedicate? | Forced choice (1?5 / 5?10 / 10?20 / 20+) | `identity_signals.available_hours` + `plan_context.weeklyAvailableHours` |

### Accept-and-sharpen (Q2)

- **Reject only** pure vision inputs (`"be better"`, `"excel in life"`, `"improve everything"`).
- **Accept** any title with a domain noun (`business`, `fitness`, `agency`, `product`, ?).
- `"Build a business"` ? **accepted but sharpenable** (domain pills: Finance agency / Product-SaaS / Service business).
- Sharpen options compose full titles (`"Build a finance agency"`) ? user can edit before Continue.
- Finalize still blocks if the stored title remains unsharpened broad/weak.

Name comes from the auth profile ? there is no separate name question.

### What happens on final answer (Q7)

When the user completes Q7, `POST /api/onboarding/finalize` streams progress while [`finalize-onboarding.ts`](src/lib/onboarding/finalize-onboarding.ts) runs:

1. **Load** responses + block unsharpened broad/weak goals.
2. **Insert** `execution_patterns` + **`identity_signals`** (goal domain, obstacle, success, available hours).
3. **Create execution goal** with success criteria and optional deadline.
4. **Generate milestones** (LLM + obstacle context; week-relative if no deadline).
5. **Write** `plan_context.weeklyAvailableHours` for the new goal.
6. **Generate today's plan** ? `ensureTodayPlan()` + cache invalidation.
7. **Build user model synchronously** ? `await synthesizeUserModel()`.
8. **Mark complete** ? redirect `/dashboard/plans`.

Q2 uses accept-and-sharpen inline pills (not a blocking error). Q4 shows animated obstacle preview. Reflection opens after 6 PM.

### Onboarding gate in the app

- [`src/middleware.ts`](src/middleware.ts) ? auth protection for dashboard routes.
- [`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) ? client check on `onboarding_progress.completed_at`; redirects to `/onboarding` if missing.

### Post-onboarding setup checklist

If a user skips a deadline or adds goals later, [`src/components/onboarding/setup-checklist.tsx`](src/components/onboarding/setup-checklist.tsx) on Today's Plan prompts them to add an active goal with a deadline via Coach.

---

## User journey after onboarding

```
Signup (/signup)
  ? Email confirm
  ? Onboarding (5 questions, accept-and-sharpen goal)
  ? Today's Plan (/dashboard/plans) ? first landing after finalize
  ? Dashboard Overview (/dashboard) ? single batched API
       ??? Goals tab ? 4-row layout (hero, pillars, trend, analytics, coach quote)
       ??? Weekly tab ? AI weekly review
       ??? Monthly tab ? monthly review panel
  ? Today's Plan ? daily briefing card, optimistic task checkboxes
  ? Coach (/dashboard/chat) ? session plan summary + dynamic prompts
  ? Coach rail ? daily note, precision CTA, knowledge bullets (max 4 ? 8 words)
  ? Goal analytics ? pace insight, milestone roadmap, ghost chart empty states
  ? Timeline ? summary strip + read-more entries
  ? Settings (/dashboard/settings)
```

**Daily rhythm** (morning / afternoon / night) comes from [`/api/rhythm`](src/app/api/rhythm/route.ts) + [`rhythm-phase.ts`](src/lib/plans/rhythm-phase.ts) and appears on Today's Plan.

---

## Architecture & data flow

### Unified `UserContext` (single source of truth)

[`src/lib/context/user-context.ts`](src/lib/context/user-context.ts) assembles everything the product needs about a user in one object:

```typescript
interface UserContext {
  profile: { name, timezone, streakDays }
  userModel: { identity, values, patterns, currentFocus }
  activeGoals: Goal[]
  todayPlan: Task[]
  recentMemories: Memory[]
  lastAchievement: string | null
  rhythmPhase: 'morning' | 'afternoon' | 'night'
  scoreToday: number
  knowledgeBullets: string[]  // max 4, ~8 words each ? for coach rail
}
```

**Cached 15 minutes** in Redis (`menai:user-context:{userId}`). Invalidated via [`invalidateUserCache()`](src/lib/redis/client.ts) at these sites:

### Batched Overview API

[`GET /api/analytics/dashboard`](src/app/api/analytics/dashboard/route.ts) returns one payload for the Overview page (replaces parallel `/api/analytics/overview` + `/api/user-model` + `/api/analytics/performance`):

- `hero` ? execution score (pillar average), tasks this week, streak, next milestone
- `pillars` ? Planning / Execution / Reflection scores from [`execution-pillars.ts`](src/lib/analytics/execution-pillars.ts)
- `trend` ? 30-day score trend + week delta
- `goals` ? stacked goal cards
- `analyticsRow` ? plan adherence, task outcomes, active time, blockers, confidence trend
- `coachInsight` ? rule-based quote ([`dashboard-insights.ts`](src/lib/analytics/dashboard-insights.ts))

**Pillar formulas (rule-based, no LLM):**

| Pillar | Formula |
|--------|---------|
| Planning | % of active goals with deadline + at least one milestone |
| Execution | Tasks completed / planned (7d rolling) |
| Reflection | Reflection days logged / 7 |
| Hero score | Average of the three pillars |

### Cache invalidation sites

| Event | File |
|---|---|
| Task completed / created | `src/app/api/tasks/route.ts` |
| Goal / milestone changed | `src/app/api/milestones/route.ts` |
| Mentor memory written | `src/lib/mentor/mentor-memory.ts` ? `persistMentorMemories()` |
| User model synthesized | `src/lib/user-model/synthesis-engine.ts` ? after synthesis write |
| Daily plan generated | `src/lib/plans/daily-plan-generator.ts` ? after `insertPlan()` |

**Consumers:**

| Feature | Reads from |
|---------|------------|
| Daily planner | `getUserContext()` first ? `formatUserContextForPlanner()` |
| Coach rail snapshot | `/api/coach/snapshot` ? `getUserContext()` + lightweight profile read |
| Overview | Single `GET /api/analytics/dashboard` (hero, pillars, trend, analytics row) |
| Coach chat prompts | `formatUserModelCompactForPrompt()` (~500 tokens, not full JSONB) |
| Memory retrieval | Skipped for messages &lt;60 chars or greetings |

### Milestones (always ensured)

[`ensureMilestonesForGoal()`](src/lib/plans/milestone-generator.ts) runs when:

- A new execution goal is created (goals API)
- Before daily plan generation (`ensureTodayPlan`)
- Missing milestones backfill via `POST /api/admin/backfill-milestones` (admin) + [`diagnose-and-backfill-milestones.sql`](supabase/scripts/diagnose-and-backfill-milestones.sql)

If a goal has no deadline, week-relative milestones (`Week 1: ?`) are used instead of skipping generation.

### Chat ? extraction ? plan pipeline

When a user sends a chat message the correct end-to-end flow is:

`
POST /api/chat ? orchestrateStreaming()
  LLM streams tokens to client
  Await DB write (assistant message) ? get real messageId
  Check goalConfidence for next missing factor (max 1 card/session)
  Append __DONE__:{"id":"uuid","cq":null|{factor,goalId,goalTitle}}
  Stream closes

Client parses sentinel:
  Stores message with server UUID (no ID mismatch on refetch)
  If cq != null: injects ConfidenceQuestionCard (1/session)

Background (finally, after stream):
  await persistExtractedData()   ? writes deadline/goal/obstacle to DB
  invalidateUserCache()          ? bust Redis 15m cache immediately
  delete daily_plans today row   ? force plan regeneration on next open
  recomputeGoalConfidence()      ? update precision score
`

### Plan generation pipeline

`
GET /api/plans/generate ? ensureTodayPlan()
  If plan cached + not stale:
    repair: insert missing task rows
    embed: write taskId into plan_content.tasks
    return enriched plan
  Otherwise:
    ensureMilestonesForUser()
    fetchPlanUserContext() ? validates 8 required context fields
    generateDailyPlanWithAI() ? gpt-4o-mini, 4 personalization rules
    insert daily_plans
    insert tasks + retrieve IDs
    embed taskId into plan_content (direct ID match, no title fragility)
    store dailyCoachNote in mentor_memories
`

**4 mandatory personalization rules in every prompt:**
1. Task title specific to this user ? never generic
2. If lastAchievement exists, at least one task references it explicitly
3. Every task has a CONCRETE DELIVERABLE (never "research X")
4. Fitness tasks include exercise name + duration + plan day number

Why-line logic: task-why-line.ts ? never "No milestones yet" or duplicates task title.

### Goal confidence (Plan Precision Score)

Rule-based 0?100, no LLM. Factors: Deadline (20), Obstacle (20), Success criteria (20), Resources (20), Execution history (20).

**Confidence Q&A:** Auto-injected as ConfidenceQuestionCard (max 1/session) when score < 60. User clicks a pill ? POST /api/confidence/answer writes to correct table, recomputes, returns next factor. Cards chain automatically.

### Coach rail (3 sections, no truncated synthesis)

1. Today's coaching note ? 1 sentence from plan calibration or daily note memory
2. Plan precision CTA ? lowest-confidence goal + action link (shown when score < 70)
3. What your coach knows ? max 4 bullets, ~8 words each

### Shipped UI fixes

Dark mode default, score badge spacing, task card metadata stripped, goal card hierarchy, radial chart empty state, rhythm empty-state copy, coach rail redesigned to 3 action-oriented sections, chat virtualizer `measureElement` for correct row heights, `__DONE__` sentinel for server message ID (prevents disappearing messages), task checkbox resolved by ID not fragile title lookup.

---

## Typography & spacing

### Design intent

- **Body copy** uses `letter-spacing: normal` and `word-spacing: normal`.
- **Display headings** (Syne) may use Tailwind `tracking-tight` (`-0.02em`) ? scoped to headings only, not body text.
- **Score block** uses JetBrains Mono for the number only; subtitle uses Plus Jakarta Sans with explicit spacing (see [`performance-score-badge.tsx`](src/components/dashboard/performance-score-badge.tsx)).

### Where spacing was breaking

| Symptom | Cause | Fix |
|---------|-------|-----|
| `0of6tasksdone` in score badge | Duplicate `.score-hero` rule applied display font to entire block | Removed duplicate rule; subtitle uses body font + `<br/>` |
| Coach rail text as one block | Plain `<p>{content}</p>` without markdown/newlines | [`MarkdownContent`](src/components/chat/markdown-content.tsx) in rail + chat |
| Squished letters globally | Inherited tight tracking on nested elements | Global typography block at end of [`globals.css`](src/app/globals.css) |

### CSS locations

| Rule | File | Purpose |
|------|------|---------|
| Design tokens (`--bg-primary`, `--accent-primary`, fonts) | `globals.css` `:root` + `html.dark` | Theme |
| `.chat-bubble-ai`, `.chat-bubble-user` | `globals.css` | Chat message containers |
| `.chat-markdown`, `.chat-plain-text` | `globals.css` (end of file) | Markdown + user message spacing |
| `.coach-rail__bubble` | `globals.css` | Rail message typography |
| `.score-hero*` | `globals.css` | Sidebar score block |

### Chat rendering

| Component | Renders |
|-----------|---------|
| [`chat-message.tsx`](src/components/chat/chat-message.tsx) | User = plain text (`white-space: pre-wrap`); Assistant = ReactMarkdown |
| [`markdown-content.tsx`](src/components/chat/markdown-content.tsx) | Shared markdown renderer for chat + coach rail |
| [`coach-rail.tsx`](src/components/chat/coach-rail.tsx) | Daily note, precision CTA, knowledge bullets from snapshot |

Dark mode default: `<html className="dark">` in [`src/app/layout.tsx`](src/app/layout.tsx) with blocking inline script reading `localStorage` key `menai-theme`, SSR `#0f0f11` fallback, and `color-scheme: dark`. Light mode is opt-in via Settings only.

**Design tokens (dark):** shell `#0f0f11` ? sidebar/rail `#141416` ? cards `#1a1a1e` ? accent `#7c6fff`  
**Layout:** sidebar **220px** ? coach rail **240px** ? main content max-width **900px** centered (`page-shell__inner` class in `dashboard/layout.tsx`)  
**Coach rail truncation:** `trimAtSentence(text, 500)` and `trimAtSentence(text, 400)` in `/api/coach/snapshot` ? cuts at last sentence boundary before limit, falls back to last word boundary + ellipsis to prevent mid-word cuts.

**Chart data:** aggregate scores use `goal_progress_snapshots` with `tasks` fallback (`computePerformanceScore`); per-goal analytics same path in `computeGoalAnalytics`. Snapshots upsert on task completion + nightly cron backfill.

---

## Project structure

```
MentalAI/
??? public/                    # Static assets (logo.png, etc.)
??? supabase/
?   ??? migrations/            # SQL migrations 001?041 (run in order)
?   ??? scripts/               # verify-v2-migrations.sql, memory debug scripts
?   ??? functions/             # Legacy edge functions (email, daily tasks)
??? tests/
?   ??? unit/                  # Vitest unit tests
?   ??? integration/           # Integration tests
?   ??? e2e/                   # End-to-end tests
??? mobile/                    # Expo React Native app (companion, separate deploy)
??? src/
    ??? app/                   # Next.js App Router ? pages + API routes
    ??? components/            # React UI components
    ??? lib/                     # Business logic, AI, data access
```

### `src/app/` ? Pages & API

| Path | Purpose |
|------|---------|
| `layout.tsx` | Root layout: fonts, dark theme script, Providers |
| `globals.css` | All design tokens + component styles |
| `page.tsx` | Marketing landing page |
| `login/`, `signup/` | Auth pages |
| `onboarding/page.tsx` | Onboarding questionnaire UI |
| `auth/callback/` | Supabase OAuth/email callback |
| `dashboard/layout.tsx` | 3-column shell: sidebar + main + coach rail |
| `dashboard/page.tsx` | Overview (Goals / Weekly / Monthly tabs) |
| `dashboard/plans/page.tsx` | Today's Plan ? tasks, rhythm, reflection |
| `dashboard/chat/page.tsx` | Full coach conversation |
| `dashboard/goals/[goalId]/page.tsx` | Per-goal analytics + charts |
| `dashboard/timeline/page.tsx` | Timeline of wins + reflections |
| `dashboard/settings/page.tsx` | Profile, theme, account |
| `dashboard/admin/page.tsx` | Internal ops dashboard |
| `dashboard/reviews/weekly|monthly/` | Standalone review pages (also embedded in Overview tabs) |
| `api/` | All server routes (see [API routes](#api-routes)) |

### `src/components/` ? UI

| Folder | Key files | Purpose |
|--------|-----------|---------|
| `auth/` | `resend-confirmation-action.tsx` | Resend signup email |
| `charts/` | `bar-chart-card.tsx`, `radial-progress-chart.tsx`, etc. | Recharts wrappers for dashboard |
| `chat/` | `chat-message.tsx`, `coach-rail.tsx`, `coach-knowledge-panel.tsx`, `markdown-content.tsx` | Coach UI |
| `dashboard/` | `performance-score-badge.tsx`, `sidebar-streak.tsx`, `goal-review-tabs.tsx` | Sidebar score + overview tabs |
| `onboarding/` | `setup-checklist.tsx` | Post-onboarding nudge when no goals |
| `plans/` | `plan-context-interview.tsx` | Mid-day plan context interview on Today's Plan when context is thin |
| `ui/` | `clay-card.tsx`, `clay-sidebar-link.tsx` | Shared primitives |

### `src/lib/` ? Business logic

| Folder | Purpose |
|--------|---------|
| `ai/` | OpenAI client, models, orchestrator, onboarding extraction |
| `ai/orchestrator/` | Chat pipeline: router ? prompt ? stream ? memory write |
| `analytics/` | Product event tracking |
| `auth/` | Bootstrap, admin checks, email cooldown |
| `chat/` | Message fetch helpers |
| `context/` | **`user-context.ts`** ? unified cached user state |
| `dashboard/` | Briefing, pending tasks |
| `email/` | Resend + auth email templates |
| `goals/` | Active goals fetch, quality gate, colors |
| `mentor/` | Mentor memories, retrieval, weakness engine |
| `onboarding/` | Questions, finalize flow |
| `plans/` | Daily plan generator, performance score, rhythm, task why-lines |
| `redis/` | Upstash client, cache keys, invalidation |
| `supabase/` | Browser + server Supabase clients |
| `tasks/` | Task quality / finishable-today checks |
| `user-model/` | Synthesis engine, loader, staleness, types |

---

## Feature map

| Feature | Route | Primary code |
|---------|-------|--------------|
| **Overview** (Goals / Weekly / Monthly tabs) | `/dashboard` | [`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) |
| **Today's Plan** (3 tasks/goal, why lines) | `/dashboard/plans` | [`src/app/dashboard/plans/page.tsx`](src/app/dashboard/plans/page.tsx), [`src/lib/plans/daily-plan-generator.ts`](src/lib/plans/daily-plan-generator.ts) |
| **Coach** (full conversation) | `/dashboard/chat` | [`src/app/dashboard/chat/page.tsx`](src/app/dashboard/chat/page.tsx), [`src/lib/ai/orchestrator/index.ts`](src/lib/ai/orchestrator/index.ts) |
| **Coach rail** (last message + memory) | All routes except chat | [`src/components/chat/coach-rail.tsx`](src/components/chat/coach-rail.tsx), [`src/app/api/coach/snapshot/route.ts`](src/app/api/coach/snapshot/route.ts) |
| **Performance score + streak** | Sidebar on every screen | [`src/components/dashboard/performance-score-badge.tsx`](src/components/dashboard/performance-score-badge.tsx), [`src/components/dashboard/sidebar-streak.tsx`](src/components/dashboard/sidebar-streak.tsx) |
| **Goal analytics** | `/dashboard/goals/[goalId]` | [`src/app/dashboard/goals/[goalId]/page.tsx`](src/app/dashboard/goals/[goalId]/page.tsx) |
| **Timeline** | `/dashboard/timeline` | [`src/app/dashboard/timeline/page.tsx`](src/app/dashboard/timeline/page.tsx) |
| **Settings** | `/dashboard/settings` | [`src/app/dashboard/settings/page.tsx`](src/app/dashboard/settings/page.tsx) |
| **Admin** | `/dashboard/admin` | [`src/app/dashboard/admin/page.tsx`](src/app/dashboard/admin/page.tsx) |

**Shell & tokens:** [`src/app/dashboard/layout.tsx`](src/app/dashboard/layout.tsx), [`src/app/globals.css`](src/app/globals.css)

**Redirects:** `/dashboard/goals` and `/dashboard/status` ? `/dashboard`

---

## Product rules

1. **3 tasks per goal per day** ? enforced in planner and task API; no bonus lists  
2. **Max 3 active execution goals** ? direction goals are synthesis-only, never in daily plan UI  
3. **Single coach persona** ? direct, anti-skip guardrails in [`prompt-builder.ts`](src/lib/ai/orchestrator/prompt-builder.ts)  
4. **Transparent memory** ? Coach rail shows what MenAI knows; stale synthesis shows **"updating?"** if >26h old  
5. **Time-aware coach** ? rhythm block in prompts from [`rhythm-phase.ts`](src/lib/plans/rhythm-phase.ts)  
6. **Personalized tasks** ? planner reads `UserContext` (identity, last achievement, mentor memories) ? not generic templates  
7. **Human why-lines** ? three-tier fallback in [`task-why-line.ts`](src/lib/plans/task-why-line.ts); never expose internal null labels  
8. **Charts** ? sidebar score sparkline (always visible, dashed when empty); per-goal rings on Today's Plan; overview weekly bar with ghost empty state; goal analytics heatmap + milestone line chart; timeline 6-month momentum bar; coach execution radar from `/api/user-model` `executionProfile`  

---

## How AI is used

Model constants: [`src/lib/ai/models.ts`](src/lib/ai/models.ts)

| Job | Model | Where |
|-----|-------|-------|
| Daily plan generation | `PLANNER_MODEL` ? gpt-4o-mini | [`daily-plan-generator.ts`](src/lib/plans/daily-plan-generator.ts) ? `/api/plans/generate` |
| Coach chat | `COACH_CHAT_MODEL` ? gpt-4o | [`orchestrator/index.ts`](src/lib/ai/orchestrator/index.ts) ? `/api/chat` |
| Milestones | `DEEP_MODEL` | [`milestone-generator.ts`](src/lib/plans/milestone-generator.ts) |
| Weekly review narrative | `DEEP_MODEL` | [`weekly-review-generator.ts`](src/lib/plans/weekly-review-generator.ts) |
| Goal completion summary | `DEEP_MODEL` | [`goal-completion.ts`](src/lib/plans/goal-completion.ts) |
| Onboarding extraction (selected Qs) | `FAST_MODEL` | [`onboarding-extraction.ts`](src/lib/ai/onboarding-extraction.ts) |
| Chat classification / extraction | `FAST_MODEL` | [`router.ts`](src/lib/ai/orchestrator/router.ts), [`extraction-engine.ts`](src/lib/ai/orchestrator/extraction-engine.ts) |
| Memory embeddings | `text-embedding-3-small` | [`memory-engine.ts`](src/lib/ai/orchestrator/memory-engine.ts) |
| Onboarding goal sharpen (vague titles) | `FAST_MODEL` | [`goal-quality-gate.ts`](src/lib/goals/goal-quality-gate.ts) ? `/api/onboarding/validate-initiative` |
| Moderation | `omni-moderation-latest` (async, post-stream) | [`safety-engine.ts`](src/lib/ai/orchestrator/safety-engine.ts) ? crisis keywords still sync |
| **User model / "Who am I?"** | **No LLM on request** | Rule-based [`synthesis-engine.ts`](src/lib/user-model/synthesis-engine.ts), 12h cache [`loader.ts`](src/lib/user-model/loader.ts) |
| Nightly cognitive + user-model refresh | Scheduled (no chat LLM) | [`synthesis-worker.ts`](src/lib/ai/orchestrator/synthesis-worker.ts) ? `/api/cron/nightly` |

### Extraction gate

[`extraction-engine.ts`](src/lib/ai/orchestrator/extraction-engine.ts) ? `shouldSkipExtraction()`:

```
skip if message.length < 10   (hard minimum)
skip if exact casual phrase   (hi, thanks, ok, ?)
skip if message.length < 60 AND no named-entity signals
  where signals = capitalized noun | any digit | goal/deadline/milestone keyword
```

This gates ~30% of chat turns from hitting the extraction LLM (gpt-4o-mini) without touching classification.

---

### Coach prompt context (each chat turn)

Built in [`prompt-builder.ts`](src/lib/ai/orchestrator/prompt-builder.ts):

- **`MENTOR_EXECUTION_PERSONA`** ? time-aware, anti-description coach persona (see below)
- `rhythmBlock` ? time of day + tasks done/expected today
- `todayPlanBlock` ? today's tasks from [`today-plan-context.ts`](src/lib/plans/today-plan-context.ts) (uses cached `UserContext` ? no duplicate fetch)
- `userModel` ? synthesized profile from `profiles.user_model`
- `memoryRetrievalBlock` ? mentor memories + vector search

### Coach persona (MENTOR_EXECUTION_PERSONA)

Core rule: **never describe, always act**. Every response must reference something only sayable to this specific user ? a date, task title, number, or recent event.

**Time-aware tone** (mandatory ? reads `rhythmBlock` before responding):

| Time + state | Opening template |
|---|---|
| Morning, 0 tasks done | "Today's plan is set. Start with [task] ? it unblocks the others." |
| Afternoon, 1 of 3 done | "You're behind pace. [N] hours left. Drop [lower-priority] and finish [critical]." |
| Evening, 0 of 3 done | "This was a lost day. Tell me what got in the way ? we adjust tomorrow's plan now." |
| Evening, 3 of 3 done | "100 today. [X] days from your next milestone. One more like this and you cross it." |

**Guardrails:**
- Never open with "Great job!" / "Well done!" ? open with facts + next action
- If behind on tasks: name which tasks are undone, name the consequence
- If excuses detected: name the pattern by label, give one specific counter-action
- Never agree for comfort; never soften accountability
- Push for next concrete step, not more planning

Deep dive: [`src/lib/ai/orchestrator/README.md`](src/lib/ai/orchestrator/README.md)

---

### Planner context fields

[`daily-plan-generator.ts`](src/lib/plans/daily-plan-generator.ts) ? `fetchPlanUserContext()` assembles:

| Field | Source | Purpose |
|---|---|---|
| `userModelNarrative` | `UserContext` | Identity, values, top patterns |
| `userContextBlock` | `formatUserContextForPlanner()` | Identity, recent win, memories |
| `yesterdayCompleted` | `tasks.completed_at` | Tasks finished yesterday ? planner builds next logical step |
| `yesterdaySkipped` | `tasks.due_date = yesterday, status pending` | Tasks skipped ? must address why or reschedule |
| `initiativeMilestones` | `goal_milestones` | Current milestone per goal |
| `milestoneUrgencyLines` | computed | "MILESTONE CLOSES IN N DAYS" if ? 5 days away |
| `deadlineUrgencyLines` | computed | "DEADLINE IN N DAYS" if goal deadline ? 7 days |
| `executionAllocationLines` | `UserContext.executionAllocation` | % allocation per initiative |
| `mentorMemoryBlock` | `mentor_memories` | Long-term mentor signals |
| `lastAchievement` | `UserContext` | Most recent win for momentum reference |

**Why-line rules (in prompt):** Every `whyItMatters` must contain a deadline reference, a progress number, or a connection to a recent specific event. Never restate the task title. Fitness tasks must include distance/reps/duration and the plan day number.

**Milestone urgency:** if a goal's next incomplete milestone is ? 5 days away, a `?? MILESTONE URGENCY` block is prepended to the prompt ? all tasks must directly complete that milestone. If goal deadline ? 7 days, a `?? DEADLINE PRESSURE` block marks all tasks deadline-critical.

---

## Database reference

**Source of truth:** [`supabase/migrations/`](supabase/migrations/) ? run in numeric order through **042**.

### Active tables (by domain)

#### Identity & profile

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `profiles` | User profile, `user_model` JSONB, `cognitive_state`, `current_focus_goal_id` | Auth trigger, synthesis, settings | Dashboard, coach, plans |

#### Goals & execution

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `goals` | Execution + direction goals (`goal_kind`), progress, deadlines | Onboarding, goals API, chat extraction | Overview, plans, coach, analytics |
| `goal_progress_snapshots` | Daily progress % + tasks completed per goal | Nightly synthesis cron | Goal analytics charts |
| `goal_milestones` | Sequential milestones per goal | Milestone generator, goals API | Daily planner, coach context |
| `tasks` | Daily coach tasks (max 3/goal/day) | Daily plan generator, user completion | Today's Plan, performance score |
| `daily_plans` | Cached plan JSON per day | Plan generator | Plans page, coach today-plan block |
| `opportunities` | Detected opportunities | Opportunities API, extraction | Momentum, coach |
| `ai_suggestions` | Pending AI suggestions | Suggestions API | Launch metrics |

#### Coach & memory

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `conversations` | Chat threads | Orchestrator, conversations API | Chat UI, coach snapshot |
| `messages` | Chat messages (+ optional `emotion_data`) | Orchestrator | Chat UI, coach snapshot |
| `memories` | Vector-backed episodic memories | Memory engine | Semantic retrieval |
| `mentor_memories` | Long-term mentor signals (permanent flag in 040) | Mentor pipeline, chat | Coach knowledge panel |
| `crisis_events` | Safety escalations | Orchestrator safety path | Admin (future) |

#### Behavioral signals

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `identity_signals` | Structured identity facts | Onboarding, extraction | User model synthesis |
| `execution_patterns` | Procrastination / drift patterns | Onboarding, extraction, chat | Cognition engine, coach |
| `commitments` | User commitments | Extraction, onboarding | Coach, weekly review |
| `relationships` | People mentioned in chat | Chat extraction | Coach memory retrieval (top 3 names) |
| `behavioral_observations` | Detected behaviors | Pattern detector | Cognition |
| `behavioral_predictions` | Predicted outcomes | Prediction engine (gated: `ENABLE_PREDICTIONS=true`) | Cognition |
| `context_confidence_log` | Prompt confidence audit | Orchestrator (10% sample + low style score) | Ops only |

#### Reflections & reviews

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `daily_reflections` | End-of-day reflections | Reflections API | Timeline, synthesis |
| `weekly_reviews` | Cached weekly AI review | Weekly review generator | Overview weekly tab |
| `plan_engagement` | Plan open/complete events | Momentum score | Retention metrics |

#### Onboarding

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `onboarding_progress` | Step completion, `current_question_id` | Onboarding API | Auth middleware, dashboard gate |
| `onboarding_responses` | Raw Q&A per question | Onboarding API | Finalize, plans, extraction |

#### Operations

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `ai_usage_log` | Token usage per feature | Usage guard | Admin dashboard |
| `product_events` | Funnel / retention events | Analytics tracker | Admin |
| `user_deletion_log` | Pre-delete audit | DB trigger | Compliance only |

### Tables removed (do not recreate)

Dropped by migrations **020**, **021**, **039**:

- `initiatives` ? merged into `goals` (`goal_kind = 'execution'`)
- `initiative_milestones` ? `goal_milestones`
- `user_reports` ? `weekly_reviews`
- `behavioral_reports`, `task_generation_log`, `habits`, `habit_logs`, `subscriptions`, `accountability_log`

### Key RPC

- `match_memories(vector, ?)` ? pgvector semantic search ([`memory-engine.ts`](src/lib/ai/orchestrator/memory-engine.ts))

### Migration 041 (chat + safety)

[`supabase/migrations/041_chat_and_safety_tables.sql`](supabase/migrations/041_chat_and_safety_tables.sql) adds `messages` + `crisis_events` with RLS ? required for coach rail message history.

---

## API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Stream coach response (orchestrator) |
| `/api/plans/generate` | GET | Generate or return today's plan |
| `/api/plans/adjust` | POST | Midday plan adjustment |
| `/api/coach/snapshot` | GET | Coach rail: score, phase, last messages, knowledge bullets |
| `/api/user-model` | GET | Synthesized profile + `updatedAt` |
| `/api/rhythm` | GET | Daily rhythm phase + prompts |
| `/api/onboarding/answer` | POST | Save onboarding step |
| `/api/onboarding/progress` | GET | Current onboarding state |
| `/api/analytics/dashboard` | GET | Batched Overview payload (hero, pillars, trend, analytics row) |
| `/api/analytics/goals/[goalId]` | GET | Per-goal analytics + pace insight |
| `/api/dashboard/today` | GET | Daily briefing for Today's Plan |
| `/api/chat/suggested-prompts` | GET | Dynamic coach chat starters |
| `/api/cron/nightly` | GET | Nightly synthesis (cron + `CRON_SECRET`) |
| `/api/tasks` | GET/PATCH | Today's tasks CRUD |
| `/api/reflections` | GET/POST | End-of-day reflection |
| `/api/auth/bootstrap` | POST | First-login profile setup |

Full list: browse [`src/app/api/`](src/app/api/)

---

## Key modules (`src/lib`)

| Module | File(s) | What it does |
|--------|---------|--------------|
| **User context** | `context/user-context.ts` | Assembles + caches unified user state for planner + rail |
| **Daily planner** | `plans/daily-plan-generator.ts` | Fetches context, calls GPT, writes tasks + `daily_plans` |
| **Why lines** | `plans/task-why-line.ts` | Three-tier fallback; rail bullet trimming |
| **Performance score** | `plans/performance-score.ts` | Daily/weekly/monthly score from task completion |
| **User model** | `user-model/synthesis-engine.ts`, `loader.ts` | Rule-based ?who am I? synthesis, 12h cache |
| **Orchestrator** | `ai/orchestrator/index.ts` | Full chat turn: classify ? retrieve ? prompt ? stream ? extract |
| **Redis** | `redis/client.ts` | Cache keys: session, cognition, **user-context** (15 min) |
| **Active goals** | `goals/active-goals.ts` | Fetches execution goals (no legacy initiatives fallback) |
| **Staleness** | `user-model/staleness.ts` | >26h ? show ?updating?? in coach UI |

---

## UI components (`src/components`)

| Component | Renders |
|-----------|---------|
| `PerformanceScoreBadge` | Purple sidebar score block + ?X of Y tasks done? |
| `SidebarStreak` | Streak count at sidebar bottom |
| `CoachRail` | Right panel: status, last messages (markdown), knowledge bullets |
| `CoachKnowledgePanel` | ?What your coach knows? ? full page or compact rail variant |
| `ChatMessage` | Single chat bubble ? user plain text, assistant markdown |
| `MarkdownContent` | Shared ReactMarkdown with `.chat-markdown` styles |
| `RadialProgressChart` | Success probability donut (min arc value, background ring) |
| `SetupChecklist` | Nudge when no goals/deadline on Today's Plan |

---

## Deploy (Vercel)

1. Link repo; set all env vars above  
2. Run migrations on production Supabase through **041**  
3. Add Vercel Cron (example ? 2 AM UTC daily):

```json
{
  "crons": [{
    "path": "/api/cron/nightly",
    "schedule": "0 2 * * *"
  }]
}
```

Set `CRON_SECRET` and send `Authorization: Bearer <CRON_SECRET>` (handled by Vercel cron headers if configured).

4. Verify: signup ? onboarding ? goal ? plan generates ? coach chat streams ? rail shows memory bullets

---

## Scripts & verification

| Script | Purpose |
|--------|---------|
| [`supabase/scripts/verify-v2-migrations.sql`](supabase/scripts/verify-v2-migrations.sql) | Confirm 039?042 applied |
| [`supabase/scripts/diagnose-and-backfill-milestones.sql`](supabase/scripts/diagnose-and-backfill-milestones.sql) | Find goals missing milestones + stale plans |
| [`supabase/scripts/verify-memory-storage.sql`](supabase/scripts/verify-memory-storage.sql) | Debug mentor memory writes |

```bash
npm run dev      # Local development
npm run build    # Production build
npm test         # Vitest (unit tests in tests/)
```

---

## Testing

| File | Covers |
|------|--------|
| `tests/performance-score.test.ts` | Score calculation |
| `tests/daily-planner.test.ts` | Planner constraints |
| `tests/rhythm-phase.test.ts` | Morning/afternoon/night phase |
| `tests/memory-persistence.test.ts` | Memory write/read |

---

## Scaling notes

- **`/api/coach/snapshot`** serves from cached `UserContext` ? split score-first + lazy knowledge if rail load grows  
- **User model** refreshes on data changes + nightly cron; UI shows **"updating?"** when synthesis is >26h stale  
- **Redis** optional in dev; required in prod for acceptable planner/rail latency  

---

## License

Private ? Yogeshwaran MenAI project.
