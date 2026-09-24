# Mettle Design System (MASTER)

Source of truth for UI work. **Do not replace these tokens** with auto-generated palettes.

## Product category

AI execution platform / developer-tool aesthetic — **Dark Mode (OLED)** + **Minimalism & Swiss Style**.

## Locked color tokens

| Token | Hex | Usage |
|-------|-----|--------|
| Shell | `#0f0f11` | App background |
| Sidebar / rail | `#141416` | `--bg-sidebar` |
| Cards / surfaces | `#1a1a1e` | `--bg-card`, `--bg-surface` |
| Accent | `#7c6fff` | CTAs, focus rings, coach rail accent |
| Success | `#22c55e` | Completed tasks, positive deltas |
| Warning | `#f59e0b` | Precision CTA, missing deadline |
| Text primary | `#f4f4f5` | Headings, body emphasis |
| Text secondary | `#a1a1aa` | Supporting copy |
| Text muted | `#71717a` | Labels, empty states |
| Border | `rgba(255,255,255,0.07)` | Card edges, dividers |

## Typography

| Role | Font | CSS |
|------|------|-----|
| Display headings | **Syne** | `font-display` |
| UI body | **Plus Jakarta Sans** | default sans |
| Numeric scores | **JetBrains Mono** | `font-data`, `[data-numeric]` |

## Layout

- **Desktop:** 3 columns — sidebar (240px) | main | coach rail (240px)
- **Tablet (≤1024px):** coach rail hidden; knowledge panel moves inline where needed
- **Mobile (≤768px):** sidebar drawer; coach via **FAB + bottom sheet** (not top-level nav)

## Spacing & radius

- Card padding: `12–16px` (`p-3` / `p-4`)
- Section gap: `12–24px`
- Radius: `--radius-md` (8px) cards; `9999px` pills/chips
- Chart empty states: min height 100px; ghost ring 90px with caption (no bare `?`)

## Motion (Framer Motion)

Respect `prefers-reduced-motion: reduce` — instant state changes when set.

| Interaction | Duration | Notes |
|-------------|----------|--------|
| Page nav fade | 180ms | Opacity only, no slide |
| Score count-up | 250ms | Only when value changes |
| Task checkbox | 200ms | Scale + check draw |
| Coach rail content | 200ms | Fade/slide in |
| Chart empty → data | 200ms | Crossfade |
| Mobile coach sheet | 220ms | Slide up; instant if reduced motion |

Max duration anywhere: **300ms**. Never animate placeholder/mock data.

## Empty states

Use `GhostRadial` or skeleton shimmer — never a lone `?` without context.

Copy pattern: **verb + outcome** — e.g. "Complete tasks this month" not "No data".

## Coach rail hierarchy

1. **Today** — daily note OR goal-aware fallback (never onboarding copy when `hasActiveGoals`)
2. **Plan precision CTA** — when confidence &lt; 70%
3. **What your coach knows** — max 4 bullets, 8 words each; hide footer when bullets empty

Onboarding empty copy only when `hasActiveGoals === false`.

## Landing page (`/`)

Hero-centric, conversion-optimized layout using **locked tokens only** (accent `#7c6fff`, not generic blue `#3b82f6`).

Headline pattern: outcome + execution verb. CTA: "Build your system" → `/signup`.

## UX checklist (audit reference)

- Contrast: muted text on `#1a1a1e` ≥ 4.5:1 for body
- Focus: visible ring `2px solid #7c6fff` on interactive elements
- Hover: opacity or border shift on cards/links; `cursor: pointer` on clickables
- Breakpoints: 375 / 768 / 1024 / 1440 — test coach FAB, sidebar drawer, overview grid
- Empty states: ghost illustration + one-line action hint

## Files

| Area | Path |
|------|------|
| Global tokens | `src/app/globals.css` |
| Ghost charts | `src/components/charts/ghost-radial.tsx` |
| Coach rail | `src/components/chat/coach-rail.tsx` |
| Mobile coach | `src/components/chat/coach-mobile-fab.tsx` |
| Page transitions | `src/components/ui/page-transition.tsx` |
| Landing | `src/app/page.tsx` |
