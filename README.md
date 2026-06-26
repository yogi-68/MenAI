# MenAI — Personal Execution OS

MenAI is an **execution OS for ambitious people**: a dark, Linear-style dashboard with a persistent performance score, exactly **3 AI-generated tasks per active goal per day**, and a single execution-focused coach that remembers who you are.

**Stack:** Next.js 16 · Supabase · OpenAI · Recharts · Vercel  
**Design:** `#0f0f11` shell · `#7c6fff` accent · **Syne** (display) · **Plus Jakarta Sans** (UI) · **JetBrains Mono** (score only)  
**Layout:** 3 columns — sidebar (score + nav) | main content | Coach rail (hidden on `/dashboard/chat` and on mobile)

---

## Launch readiness (first external user)

The product is code-complete for a single beta user. Operational blockers:

| Blocker | Action |
|---------|--------|
| Database | Run Supabase migrations **001 through 041** on production |
| Env vars | Set Supabase, OpenAI, Redis (prod cache), Resend, `CRON_SECRET` on Vercel |
| Nightly cron | Schedule `GET /api/cron/nightly` with `Authorization: Bearer $CRON_SECRET` |
| User path | Signup → onboarding → at least one **execution goal with a deadline** |

Verify schema after migrate: `supabase/scripts/verify-v2-migrations.sql`

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
| `UPSTASH_REDIS_REST_URL` | Prod | Cognitive-state cache |
| `UPSTASH_REDIS_REST_TOKEN` | Prod | Cognitive-state cache |
| `RESEND_API_KEY` | Yes | Auth emails |
| `NEXT_PUBLIC_APP_URL` | Yes | Email links |
| `CRON_SECRET` | Prod | Protects `/api/cron/nightly` |

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

**Redirects:** `/dashboard/goals` and `/dashboard/status` → `/dashboard`

---

## Product rules

1. **3 tasks per goal per day** — enforced in planner and task API; no bonus lists  
2. **Max 3 active execution goals** — direction goals are synthesis-only, never in daily plan UI  
3. **Single coach persona** — direct, anti-skip guardrails in [`prompt-builder.ts`](src/lib/ai/orchestrator/prompt-builder.ts)  
4. **Transparent memory** — Coach rail shows what MenAI knows; stale synthesis shows **"updating…"** if >26h old  
5. **Time-aware coach** — rhythm block in prompts from [`rhythm-phase.ts`](src/lib/plans/rhythm-phase.ts)

---

## How AI is used

Model constants live in [`src/lib/ai/models.ts`](src/lib/ai/models.ts):

| Job | Model | Where |
|-----|-------|-------|
| Daily plan generation | `PLANNER_MODEL` → gpt-4o-mini | [`daily-plan-generator.ts`](src/lib/plans/daily-plan-generator.ts) · `/api/plans/generate` |
| Coach chat | `COACH_CHAT_MODEL` → gpt-4o | [`orchestrator/index.ts`](src/lib/ai/orchestrator/index.ts) · `/api/chat` |
| Milestones | `DEEP_MODEL` | [`milestone-generator.ts`](src/lib/plans/milestone-generator.ts) |
| Weekly review narrative | `DEEP_MODEL` | [`weekly-review-generator.ts`](src/lib/plans/weekly-review-generator.ts) |
| Goal completion summary | `DEEP_MODEL` | [`goal-completion.ts`](src/lib/plans/goal-completion.ts) |
| Onboarding extraction (selected Qs) | `FAST_MODEL` | [`onboarding-extraction.ts`](src/lib/ai/onboarding-extraction.ts) |
| Chat classification / extraction | `FAST_MODEL` | [`router.ts`](src/lib/ai/orchestrator/router.ts), [`extraction-engine.ts`](src/lib/ai/orchestrator/extraction-engine.ts) |
| Memory embeddings | `text-embedding-3-small` | [`memory-engine.ts`](src/lib/ai/orchestrator/memory-engine.ts) |
| Moderation | `omni-moderation-latest` | [`openai.ts`](src/lib/ai/openai.ts) |
| **User model / "Who am I?"** | **No LLM on request** | Rule-based [`synthesis-engine.ts`](src/lib/user-model/synthesis-engine.ts), 12h cache [`loader.ts`](src/lib/user-model/loader.ts) |
| Nightly cognitive + user-model refresh | Scheduled (no chat LLM) | [`synthesis-worker.ts`](src/lib/ai/orchestrator/synthesis-worker.ts) · `/api/cron/nightly` |

### Coach prompt context (each chat turn)

Built in [`prompt-builder.ts`](src/lib/ai/orchestrator/prompt-builder.ts):

- `MENTOR_EXECUTION_PERSONA` — accountability guardrails  
- `rhythmBlock` — time of day + tasks done today  
- `todayPlanBlock` — today's tasks from [`today-plan-context.ts`](src/lib/plans/today-plan-context.ts)  
- `userModel` — synthesized profile from `profiles.user_model`  
- `memoryRetrievalBlock` — mentor memories + vector search  

Deep dive: [`src/lib/ai/orchestrator/README.md`](src/lib/ai/orchestrator/README.md)

---

## Database

**Source of truth:** [`supabase/migrations/`](supabase/migrations/) — run in numeric order through **041**.

### Active tables (by domain)

#### Identity & profile

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `profiles` | User profile, `user_model` JSONB, `cognitive_state`, `current_focus_goal_id` | Auth trigger, synthesis, settings | Dashboard, coach, plans |

#### Goals & execution

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `goals` | Execution + direction goals (`goal_kind`), progress, deadlines | Onboarding, goals API, chat extraction | Overview, plans, coach, analytics |
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
| `relationships` | People mentioned in chat | Chat extraction only | *Not yet read in UI — reserved for future coach context* |
| `behavioral_observations` | Detected behaviors | Pattern detector | Cognition |
| `behavioral_predictions` | Predicted outcomes | Prediction engine | Cognition |
| `context_confidence_log` | Prompt confidence audit | Orchestrator | Ops only |

#### Reflections & reviews

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `daily_reflections` | End-of-day reflections | Reflections API | Timeline, synthesis |
| `weekly_reviews` | Cached weekly AI review | Weekly review generator | Overview weekly tab |
| `plan_engagement` | Plan open/complete events | Momentum score | Retention metrics |

#### Onboarding

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `onboarding_progress` | Step completion | Onboarding API | Auth middleware, dashboard gate |
| `onboarding_responses` | Raw Q&A | Onboarding API | Extraction, plans |

#### Operations

| Table | Stores | Written by | Read by |
|-------|--------|------------|---------|
| `ai_usage_log` | Token usage per feature | Usage guard | Admin dashboard |
| `product_events` | Funnel / retention events | Analytics tracker | Admin |
| `user_deletion_log` | Pre-delete audit | DB trigger | Compliance only |

### Tables removed (do not recreate)

Dropped by migrations **020**, **021**, **039**:

- `initiatives` → merged into `goals` (`goal_kind = 'execution'`)
- `initiative_milestones` → `goal_milestones`
- `user_reports` → `weekly_reviews`
- `behavioral_reports`, `task_generation_log`, `habits`, `habit_logs`, `subscriptions`, `accountability_log`

### Key RPC

- `match_memories(vector, …)` — pgvector semantic search ([`memory-engine.ts`](src/lib/ai/orchestrator/memory-engine.ts))

---

## API routes (selected)

| Route | Purpose |
|-------|---------|
| `POST /api/chat` | Stream coach response (orchestrator) |
| `GET /api/plans/generate` | Generate or return today's plan |
| `GET /api/coach/snapshot` | Coach rail: score, last message, phase |
| `GET /api/user-model` | Synthesized profile + `updatedAt` |
| `GET /api/analytics/overview` | Overview goals + charts |
| `GET /api/analytics/performance` | Score, streak, task counts |
| `GET /api/cron/nightly` | Nightly synthesis (cron + `CRON_SECRET`) |

Full list: `src/app/api/`

---

## Deploy (Vercel)

1. Link repo; set all env vars above  
2. Run migrations on production Supabase through **041**  
3. Add Vercel Cron (example — 2 AM UTC daily):

```json
{
  "crons": [{
    "path": "/api/cron/nightly",
    "schedule": "0 2 * * *"
  }]
}
```

Set `CRON_SECRET` and send `Authorization: Bearer <CRON_SECRET>` (handled by Vercel cron headers if configured).

4. Verify: signup → onboarding → goal → plan generates → coach chat streams

---

## Scripts

| Script | Purpose |
|--------|---------|
| [`supabase/scripts/verify-v2-migrations.sql`](supabase/scripts/verify-v2-migrations.sql) | Confirm 039–041 applied |
| [`supabase/scripts/verify-memory-storage.sql`](supabase/scripts/verify-memory-storage.sql) | Debug mentor memory writes |

---

## Scaling notes

- **`/api/coach/snapshot`** bundles score + messages + knowledge — split into score-first + lazy knowledge if rail load grows  
- **User model** refreshes on data changes + nightly cron; UI shows **"updating…"** when synthesis is >26h stale  

---

## License

Private — Yogeshwaran MenAI project.
