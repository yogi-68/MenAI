# Mettle — flow document

How the product works, end to end. Ten transaction layers, each with what
enters, what happens, what leaves, and where it hands off.

A "transaction layer" here is a boundary where data changes custody: the
request crosses into the application, the application into the model, the
model back into storage. Each section names its own failure behaviour,
because that is where most of this codebase's real bugs lived.

> Companion documents: [`README.md`](README.md) for setup and contribution,
> [`design-system/MASTER.md`](design-system/MASTER.md) for visual tokens.

---

## The idea in one paragraph

Most planning tools ask the same of you on every day. Mettle asks you one
question each morning — where are you, 1 to 10 — and sizes the day from the
answer. Over weeks that reading accumulates into a model of how you actually
work: when you think clearly, what drains you, what you do right before you
stop. The coach uses that model to plan, to hold you to what you said, and to
ask the single most useful question it does not yet know the answer to.

It is a **performance coach, not a therapist**, and it says so.

---

## Layer map

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1  IDENTITY & SESSION      signup → middleware → onboarding gate     │
├──────────────────────────────────────────────────────────────────────┤
│ 2  INTAKE & KNOWLEDGE      7 questions → extraction → user model     │
├──────────────────────────────────────────────────────────────────────┤
│ 3  STATE                   daily reading → band → capacity           │
├──────────────────────────────────────────────────────────────────────┤
│ 4  CONVERSATION            message → pipeline → stream → background  │
├──────────────────────────────────────────────────────────────────────┤
│ 5  MEMORY & SYNTHESIS      three tiers → promotion → user model      │
├──────────────────────────────────────────────────────────────────────┤
│ 6  MENTAL MODEL            emotion → regulation → cognition → state  │
├──────────────────────────────────────────────────────────────────────┤
│ 7  PLANNING & EXECUTION    context → generation → tasks → completion │
├──────────────────────────────────────────────────────────────────────┤
│ 8  ANALYTICS & SCORING     events → pillars → score → dashboard      │
├──────────────────────────────────────────────────────────────────────┤
│ 9  SAFETY                  crisis → moderation → output guard        │
├──────────────────────────────────────────────────────────────────────┤
│ 10 SCHEDULED & PIPELINE    cron → synthesis · git → CI → production  │
└──────────────────────────────────────────────────────────────────────┘
```

Layers 1–3 must complete before 4–8 produce anything useful. Layer 9 wraps
layer 4 on both sides. Layer 10 runs outside any request.

---

## 1 · Identity & session

**In:** an HTTP request. **Out:** a `User`, or a redirect.

```
request
  → src/middleware.ts                 matcher: everything but static assets
  → lib/supabase/middleware.ts        refresh the session cookie
      ├── no session + protected path → /login
      └── session + onboarding incomplete → /onboarding
  → route handler
      → lib/api/handler.ts withAuth()
          authenticate → rate limit (per user) → validate → run
```

`withAuth` is the only authenticated entry point. Before it, all 38
authenticated routes repeated the same three-line session check by hand and
parsed bodies with a bare `await req.json()`.

Order matters: authentication precedes rate limiting, so limits are per user
rather than per IP; validation follows both, so a malformed body from an
unauthenticated caller costs nothing.

| Concern | Behaviour |
|---|---|
| No session | 401, uniform body |
| Over rate limit | 429 with `RateLimit-*` headers |
| Malformed JSON | 400 — never a 500 from an unhandled `SyntaxError` |
| Schema mismatch | 400 with field-level detail |
| Handler throws | 500, cause logged with a request id, nothing leaked |

Authorization fails **closed**. Rate limiting fails **open** — it is a cost
control, and every caller past it is already authenticated, so a cache blip
should not take the product down. That asymmetry is deliberate.

**Hands off to:** layer 2 for a new account, layer 4 for a returning one.

---

## 2 · Intake & knowledge

**In:** a new account. **Out:** a goal, a deadline, a capacity baseline.

Seven questions, one at a time, with a Back button.

| # | Question | Becomes |
|---|---|---|
| Q1 | What are you trying to achieve? | `goals.title` (quality-gated) |
| Q2 | By when? | `goals.target_date` |
| Q3 | What gets in the way? | `execution_patterns` |
| Q4 | What would make 30 days a success? | `goals.success_criteria` |
| Q5 | Hours a week? | `plan_context.weeklyAvailableHours` |
| Q6 | Where are you today, 1–10? | first `state_checkins` row |
| Q7 | What drains you fastest? | `plan_context.depletedBy` |

`buildQuestionFlow()` branches on the answers: someone who says they are
running on empty at Q3, or scores ≤3 at Q6, is not then asked Q7 — they have
already answered it, and asking anyway reads as not listening.

Q1 passes through `goal-quality-gate.ts`, which rejects a direction ("be more
disciplined") and offers to sharpen a broad one. Finalization then creates the
goal, generates milestones, produces the first plan, and seeds the coach.

**The intake is deliberately short.** People disclose how their mind works
*after* a product has proved useful. Depth is layer 2b's job.

### 2b · The continuous interview

Runs forever, at most five questions a day, one at a time.

```
lib/plans/plan-context-dimensions.ts
  score 10 dimensions → marginal gain per dimension → pick the weakest
      ├── score < 45 → a fixed question (no model call, stable wording)
      └── otherwise  → lib/plans/ai-identity-interview.ts phrases one
  → answer → applyInterviewAnswer() → plan_context
```

| Dimension | Weight | Asked? |
|---|---|---|
| Outcome clarity | 0.15 | yes |
| Biggest obstacle | 0.13 | yes |
| Deadline | 0.12 | yes |
| Goal baseline | 0.10 | yes |
| Available time | 0.10 | yes |
| Energy pattern | 0.10 | yes |
| What drains you | 0.10 | yes |
| State baseline | 0.08 | **no** — improves by logging |
| What restores you | 0.07 | yes |
| Recent activity | 0.05 | **no** — measured from behaviour |

It stops on: no goal yet · five asked today · nothing left worth asking ·
coverage already sufficient.

> This engine was unreachable. Every dimension carried `interviewable: false`,
> so marginal gain was 0 for all of them and the picker could never return a
> question. A test now fails if it goes mute again.

**Hands off to:** layer 5 (the user model), layer 7 (planning).

---

## 3 · State

**In:** one number a day. **Out:** a band, and a capacity figure.

```
POST /api/mind/state  { score, signals[], note }
  → bandForScore(score)              depleted | low | steady | strong
  → upsert state_checkins            one row per day; re-submitting replaces
  → invalidate today's plan          capacity changed, so the plan is stale
  → band is low? offer a reset
```

| Score | Band | Tasks that day |
|---|---|---|
| 1–2 | depleted | 1 |
| 3–4 | low | 2 |
| 5–7 | steady | 3 |
| 8–10 | strong | 3 |

`summarizeState()` turns the history into an average, a trend, recurring
signals and a consistency count. **It will not call a trend from fewer than
four readings** — below that the noise in a self-report scale exceeds the
signal, and a coach that announces a downturn from two data points stops being
believed.

With no readings at all it returns the steady band, so an unlogged user sees
exactly the previous behaviour.

**Hands off to:** layer 4 (prompt context), layer 7 (plan sizing).

---

## 4 · Conversation

**In:** a message. **Out:** a stream, a stored reply, and background writes.

```
POST /api/chat
  ├─ authenticate · rate limit (20/min) · daily quota · validate (≤4000 chars)
  └─ orchestrateStreaming()

     ① crisis check                   regex, synchronous
        └─ escalation? → canned response, log the event, return  ← layer 9

     ② parallel:  detect emotion (model) · resolve conversation
     ③ insert the user message
     ④ classify intent                regex
     ⑤ parallel:  history · memory · profile · cognition · user model
     ⑥ parallel:  mentor ingest · pinned memories · retrieval ·
                  task stats · user context · state readings
     ⑦ determine state → select model tier
     ⑧ build the prompt
     ⑨ stream, through the response guard
     ⑩ background: extraction · cache invalidation · model refresh
```

Steps ⑤ and ⑥ were previously nine sequential awaits, all of them before the
first token. Step ⑥ alone was five.

### Model tiers

`selectModel()` returns a **copy** of a tier config. It used to return the
shared object and the caller overwrote `.model` on the next line — which both
nullified the routing and permanently corrupted the tier for every later
request in the process.

| Condition | Tier | Model |
|---|---|---|
| Crisis or danger | premium | deep |
| Founder / strategic / wisdom | premium | deep |
| Emotional intensity ≥ 8 | premium | deep |
| Planning / accountability / review | standard | fast |
| Everything else | cheap | fast |

### The stream contract

```
<reply text>\n__DONE__:{"id":"<uuid>","cq":null}\n
```

Metadata known up front travels in `X-*` headers; the message id and any
follow-up question are not known until the reply is complete, so they travel
in a trailer. `createStreamParser()` buffers across reads — the previous
client searched a single decoded chunk, so whenever the trailer straddled a
read boundary the raw JSON rendered as message text.

### The response guard

Every chunk passes through `createResponseGuard()` before it is emitted, so
**what the user reads, what is stored, and what is validated are the same
string by construction**. Validation used to run after the whole reply had
streamed, so trimming applied only to the database copy and the safety checks
flagged text already on screen.

**Hands off to:** layer 5 (memory), layer 9 (moderation), layer 7 (extraction
can create goals and complete tasks).

---

## 5 · Memory & synthesis

**In:** conversation, reflections, behaviour. **Out:** a user model.

Three tiers, by how durable a fact is:

| Tier | Store | Retrieval | Lifetime |
|---|---|---|---|
| Semantic | `memories` + pgvector | embedding, threshold 0.65 | aged out |
| Mentor | `mentor_memories` | influence score | aged, pinnable |
| Model | `profiles.user_model` | read whole | re-synthesized |

```
message → extractLifeData() → confidence gate → tier 1 or 2
                                              → mentor signal → influence
nightly → synthesizeUserModel() → tier 3
```

`getUserModel()` is loaded once per turn and passed into `getUserContext()`;
it previously ran twice, and on a cold cache the second run could trigger full
synthesis on the request path.

**Hands off to:** layer 4 (prompt), layer 7 (planner context).

---

## 6 · Mental model

**In:** message, history, behaviour. **Out:** the state that shapes the reply.

```
emotion-engine      model      → primary emotion, intensity, sentiment
regulation-engine   keyword    → regulation needs, pacing
cognition-engine    database   → maturity, momentum, commitments, weaknesses
pattern-detector    memory     → recurring behavioural patterns
state-machine       rules      → LISTENING · PLANNING · WISDOM_FIRST · …
```

Cognitive state is cached in Redis for five minutes.

**Writing a pattern.** All five detectors now go through
`src/lib/patterns/record.ts`, which normalizes the name against one vocabulary
and upserts on a unique `(user_id, pattern)` — see layer 5a below. Before that,
each hand-rolled its own select-then-insert with its own column set, and two of
them wrote values the CHECK constraint rejected.

> **Still outstanding.** `pattern-detector` writes to
> `behavioral_observations` and nothing reads it, so that detector feeds
> nothing. Eight confidence scores still run on unrelated scales. Both are
> tracked in the README's "Next" section.

---

## 7 · Planning & execution

**In:** goals, context, capacity. **Out:** today's tasks.

```
GET /api/plans/generate → ensureTodayPlan()
  fresh plan? → repair missing task rows, embed ids, return
  otherwise:
    ensureMilestonesForUser()
    fetchPlanUserContext()          8 required fields
    summarizeState()                → tasksPerGoal  ← layer 3
    generateDailyPlanWithAI()       fast model
    insert daily_plans → insert tasks → embed task ids
```

Task count is `activeGoals × tasksPerGoal`, where `tasksPerGoal` comes from
today's state. A fixed quota asks the same of someone at 2/10 as at 9/10, so
the day they most need help is the day the plan is least achievable.

The staleness check uses the same state-derived count. Comparing a
deliberately shortened plan against the fixed constant would mark it
permanently incomplete and regenerate it on every page load.

Completion flows back: `PATCH /api/tasks` updates the streak, writes a
progress snapshot, schedules a model refresh, and invalidates the cache.

---

## 8 · Analytics & scoring

**In:** tasks, reflections, goals, state. **Out:** the dashboard.

```
GET /api/analytics/dashboard
  parallel: performance · goals · pillars · context · model · milestone
  computeGoalAnalyticsBatch()   ← one batched read for every goal
```

| Pillar | Formula |
|---|---|
| Planning | goals with a deadline and ≥1 milestone |
| Execution | completed ÷ planned, 7-day rolling |
| Reflection | reflection days ÷ 7 |

All rule-based. No model call anywhere in this layer.

> The batched read replaced a per-goal loop: twelve goals × four queries was
> 48 round trips for one page load.

---

## 9 · Safety

**In:** every message in, every token out. **Out:** an escalation, or nothing.

```
IN   detectCrisis()          regex, synchronous, before anything else
       └─ escalate → canned response + resources, log to crisis_events
     runModerationCheck()    OpenAI, off the hot path

OUT  createResponseGuard()   per chunk, before it is emitted
       ├─ prohibited claim → halt the stream, never persist it
       └─ over length      → stop cleanly at a sentence boundary
```

Both **fail closed**:

- Moderation returns "flagged" when the API errors. Returning "clean" meant a
  provider outage silently disabled moderation entirely, which is exactly when
  you most need it.
- A crisis event that fails to insert is retried and then logged at error
  level. It used to be swallowed by `catch { /* non-blocking */ }` — a crisis
  that, as far as the records were concerned, never happened.

The boundary in `NON_CLINICAL_BOUNDARY` appears in the system prompt, the
landing page, the terms, and the crisis response. One string, so it reads the
same everywhere.

---

## 10 · Scheduled work & delivery

### Nightly

```
vercel.json cron → GET /api/cron/nightly   03:00 UTC
  Bearer CRON_SECRET, fail closed
  → runNightlySynthesis()
      per active user: cognitive state · user model · progress snapshots
```

> There was no `vercel.json`, so this had **never run in production** — and
> the secret check was written `if (cronSecret && ...)`, so an unset secret
> made the route public. It loops every active user through model synthesis.

### Delivery

```
git push → GitHub Actions
             typecheck → lint → unit (67) → build → e2e (15)
         → Vercel preview
         → production
```

Linting had never run either: the script called `next lint`, which Next 16
removed, and there was no ESLint config at all.

| Surface | Purpose |
|---|---|
| `/api/health` | database + cache probe; 503 when the database is down |
| `logger` | structured JSON, PII redacted, request id on every line |
| `RATE_LIMITS` | per-route buckets, Redis fixed window |

---

## Where data lives

| Table | Written by | Read by |
|---|---|---|
| `profiles` | layers 1, 5 | 2, 4, 7 |
| `goals`, `goal_milestones` | 2, 4, 7 | 7, 8 |
| `tasks`, `daily_plans` | 7 | 7, 8 |
| `state_checkins` | 3 | 3, 4, 7 |
| `conversations`, `messages` | 4 | 4, 5 |
| `memories`, `mentor_memories` | 5 | 4, 5 |
| `daily_reflections` | 7 | 5, 8 |
| `execution_patterns` | 2, 6 | 4, 6 |
| `crisis_events` | 9 | operators |
| `ai_usage_log` | 4, 7 | cost reporting |
| `product_events` | all | funnel analysis |

Every table carries `user_id` with RLS scoping rows to their owner. The
service-role client bypasses RLS and is confined to server-side work that has
already established who the user is.

---

## Failure behaviour, summarised

| Component | On failure | Why |
|---|---|---|
| Authentication | closed | It is the boundary |
| Cron secret | closed | An open door here is a spend bomb |
| Moderation | closed | An outage must not disable it |
| Output guard | closed | Unsafe text is never persisted |
| Rate limiting | open | Cost control, not authorization |
| AI quota | open | A database blip shouldn't lock a user out |
| Redis | open | Degrades to rebuilding from the database |
| Crisis logging | retried, then alerted | Never silently dropped |
| Recurring task scheduling | logged | Silence ends the habit |
