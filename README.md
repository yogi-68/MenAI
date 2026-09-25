# Mettle

**Your mental performance coach.**

Most planning tools ask the same of you every day. Mettle asks one question
each morning — where are you, 1 to 10 — and sizes the day from the answer.
Over weeks that reading becomes a model of how you actually work: when you
think clearly, what drains you, what you do right before you stop.

It is a performance coach, **not a therapist**, and it says so in the product.

- **How it works, end to end:** [`FLOW.md`](FLOW.md)
- **Visual tokens and layout:** [`design-system/MASTER.md`](design-system/MASTER.md)

---

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + OpenAI
npm run dev
```

Apply the database schema:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Then open `http://localhost:3000`, sign up, and complete the seven-question
intake.

---

## Verify

```bash
npm run verify     # typecheck → lint → unit → build
npm run test:e2e   # Playwright, on its own port, against a production build
```

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint flat config |
| `npm run test` | 103 unit tests |
| `npm run test:e2e` | 15 end-to-end tests |
| `npm run build` | Production build |

E2E runs on port 3100 with `reuseExistingServer` off, so it cannot silently
attach to something else already on 3000.

---

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side writes (bypasses RLS) |
| `OPENAI_API_KEY` | yes | Coach and planner |
| `NEXT_PUBLIC_APP_URL` | yes | Email links, canonical origin |
| `RESEND_API_KEY` | yes | Auth emails |
| `CRON_SECRET` | **production** | Guards `/api/cron/nightly` — fails closed |
| `UPSTASH_REDIS_REST_URL` | production | Cache and rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | production | " |
| `OPENAI_FAST_MODEL` | no | Default `gpt-4o-mini` |
| `OPENAI_DEEP_MODEL` | no | Default `gpt-4o` |
| `OPENAI_TIMEOUT_MS` | no | Default 45000 |
| `OPENAI_MAX_RETRIES` | no | Default 2 |
| `AI_CHAT_DAILY_LIMIT` | no | Default 50 |
| `AI_DAILY_PLAN_LIMIT` | no | Default 5 |
| `LOG_LEVEL` | no | `debug` outside production |

**Without `CRON_SECRET`, the nightly job refuses to run.** That is deliberate:
the check used to be `if (cronSecret && ...)`, so an unset secret left an
endpoint that loops every active user through model synthesis publicly
callable.

Without Redis the app still works — caching and rate limiting degrade to
no-ops and context is rebuilt from the database on each request.

---

## Structure

```
src/
  app/
    page.tsx              landing (server component)
    privacy/ terms/       linked from the footer
    onboarding/           7-question intake, one at a time
    dashboard/
      page.tsx            overview — score, pillars, goals
      mind/               state check-in, patterns, resets
      plans/              today's tasks
      chat/               the coach
      timeline/           history
      settings/           profile, theme, export, delete
    api/                  46 route handlers
  lib/
    api/                  withAuth, errors, rate limiting
    observability/        structured logger with PII redaction
    product/brand.ts      the product name, in one place
    mind/                 state scale, check-ins, resets
    patterns/             the pattern vocabulary and the one way to write one
    ai/orchestrator/      the conversation pipeline
    plans/                planning, interview, scoring
    user-model/           synthesis
    mentor/               memory tiers
supabase/migrations/      045 forward-only migrations
tests/
  unit/                   103 tests
  e2e/                    15 tests, no account needed
```

Roughly 40k lines of TypeScript.

---

## Architecture in brief

| Layer | Entry point |
|---|---|
| Identity | `src/middleware.ts`, `lib/api/handler.ts` |
| Intake | `lib/onboarding/questions.ts` |
| Interview | `lib/plans/plan-context-dimensions.ts` |
| State | `lib/mind/state-checkins.ts` |
| Conversation | `lib/ai/orchestrator/index.ts` |
| Memory | `lib/mentor/`, `lib/user-model/` |
| Planning | `lib/plans/daily-plan-generator.ts` |
| Safety | `lib/ai/orchestrator/safety-engine.ts`, `response-validator.ts` |

Two rules worth knowing before changing anything:

1. **Authorization fails closed, cost control fails open.** Authentication,
   the cron secret, moderation and the output guard all refuse on error. Rate
   limiting, the AI quota and Redis all degrade to permissive, because every
   caller past them is already authenticated and an outage should not take the
   product down.

2. **What the user reads is what gets stored.** The response guard decides
   what may be emitted, chunk by chunk, so the streamed text, the persisted
   text and the validated text are the same string by construction.

[`FLOW.md`](FLOW.md) has the full picture.

---

## Deploying

Vercel. `vercel.json` registers the nightly cron at 03:00 UTC.

Before the first production deploy:

- [ ] Run migrations (`npx supabase db push`)
- [ ] Set every variable marked **production** above
- [ ] Confirm the cron fires: `vercel logs --since 1d | grep cron/nightly`
- [ ] Confirm `/api/health` returns 200

---

## Next

Known, deliberately not yet done:

- **Route pattern-detector output into a prompt.** It writes to
  `behavioral_observations` and nothing reads it. The five write paths and the
  vocabulary are now consolidated (`src/lib/patterns/`), but this detector
  still feeds nothing.
- **One confidence scale.** Eight scorers currently run on unrelated ranges;
  `extraction-engine` hardcodes thresholds while `product/constants.ts`
  defines `MEMORY_CONFIDENCE` that it ignores.
- **Merge the duplicate persona blocks.** The voice and product rules are
  injected twice into the same system message.
- **E2E for the signed-in journey.** The current suite covers public surfaces
  only; intake → first plan → chat turn → completion needs a seeded account.
- **Migration hygiene.** There are two `004_` files and no `001`/`002`.

---

## License

MIT
