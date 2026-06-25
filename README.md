# MenAI — Personal Execution OS

MenAI is an **execution OS for ambitious people** — crisp UI, persistent performance score, and a coach that knows your goals.

**Stack:** Next.js 16 · Supabase · OpenAI · Recharts · Vercel  
**Design:** Linear-style flat surfaces · **Syne** display · **Plus Jakarta Sans** UI · **JetBrains Mono** for scores  
**Default theme:** Dark (toggle to light in Settings)

---

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Run Supabase migrations through **040**, then verify with `supabase/scripts/verify-v2-migrations.sql`.

---

## Navigation

| Page | Route | Purpose |
|------|-------|---------|
| **Overview** | `/dashboard` | Goals, analytics charts, weekly/monthly reviews |
| **Coach** | `/dashboard/chat` | Coach chat + “What your coach knows” panel |
| **Today's Plan** | `/dashboard/plans` | Exactly **3 tasks per active goal** per day |
| **Timeline** | `/dashboard/timeline` | Life history |
| **Settings** | `/dashboard/settings` | Name + theme |

**Performance Score** (0–100) lives in the **sidebar on every screen** — 3 tasks/goal/day = 100.

---

## Product rules

1. **3 tasks per goal per day** — no bonus tasks, no optional stretches  
2. **Direction goals** — context for synthesis only; never in daily plan UI  
3. **Time-aware coach** — tone shifts by time of day and completion progress  
4. **Transparent memory** — Coach panel shows what MenAI knows, still learning, and evidence  
5. **Max 3 active execution goals**

---

## License

Private — Yogeshwaran MenAI project.
