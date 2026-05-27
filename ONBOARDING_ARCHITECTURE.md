# MenAI Onboarding System - Architecture Diagram

## System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                                 │
└─────────────────────────────────────────────────────────────────────┘

1. User Signs Up
   └─> checks profile.onboarding_completed
       └─> false → Redirect to /onboarding
       └─> true  → Access dashboard

2. Onboarding Flow (/onboarding)
   │
   ├─> Question Card (1 of 10)
   │   ├─> Progress Bar (10%, 20%, ... 100%)
   │   ├─> Question Prompt
   │   ├─> Input Field (text/textarea/choice/slider)
   │   ├─> [Skip] button (optional questions)
   │   └─> [Next] button
   │
   ├─> On Answer Submit:
   │   ├─> POST /api/onboarding/answer
   │   │   ├─> Save to onboarding_responses
   │   │   └─> Trigger extractOnboardingMemory() [async]
   │   │
   │   └─> POST /api/onboarding/progress
   │       └─> Update current_question_id
   │
   └─> Repeat for 10 questions
       └─> On Q10 completion:
           ├─> Mark onboarding_completed = true
           ├─> POST /api/dashboard/snapshot (rebuild intelligence)
           └─> Redirect to /dashboard

3. Dashboard Access
   └─> Shows synthesized intelligence from onboarding seeds


┌─────────────────────────────────────────────────────────────────────┐
│                    EXTRACTION PIPELINE                               │
└─────────────────────────────────────────────────────────────────────┘

User Answer Input
      │
      ▼
┌─────────────────┐
│  API /answer    │  ← Saves response immediately
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ onboarding_responses    │  processed: false
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  extractOnboardingMemory()           │  (async, non-blocking)
│  ├─> Get question extractor          │
│  ├─> Call GPT-4o-mini (for text)     │
│  └─> Return structured extraction    │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Confidence Filtering                │
│  ├─> Goals: >0.75                    │
│  ├─> Patterns: >0.70                 │
│  ├─> Identity: >0.65                 │
│  └─> Aspirational: >0.50             │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  persistExtractedMemory()            │
│  ├─> Insert goals                    │
│  ├─> Insert commitments              │
│  ├─> Insert identity_signals         │
│  ├─> Upsert execution_patterns       │
│  └─> Update profile fields           │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Mark processed: true                │
└──────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                    MEMORY SYNTHESIS                                  │
└─────────────────────────────────────────────────────────────────────┘

After onboarding completion:

┌─────────────────────┐
│  Raw Memory Tables  │
├─────────────────────┤
│ • goals             │
│ • commitments       │
│ • identity_signals  │
│ • execution_patterns│
│ • profile fields    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│  generateDashboardIntelligence  │
│  (synthesis.ts)                 │
├─────────────────────────────────┤
│  Current Direction              │
│    ← goals + identity +         │
│      commitments (weighted)     │
│                                 │
│  AI Observation                 │
│    ← execution_patterns         │
│      (requires 2+ occurrences)  │
│                                 │
│  Active Focus                   │
│    ← tasks + goals              │
│      (top 3-5 items)            │
│                                 │
│  Suggested Next Steps           │
│    ← pattern-based tactics      │
│      (e.g., "Reduce scope")     │
│                                 │
│  Momentum Trend                 │
│    ← task completion rate       │
│      (null if <30 days data)    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Dashboard Display  │
└─────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE SCHEMA                                   │
└─────────────────────────────────────────────────────────────────────┘

onboarding_responses
├─ id (uuid, PK)
├─ user_id (uuid, FK → auth.users)
├─ question_id (text)
├─ response_text (text, nullable)
├─ response_data (jsonb, nullable)  ← multi-choice, slider data
├─ processed (boolean)
└─ created_at (timestamptz)

onboarding_progress
├─ user_id (uuid, PK, FK → auth.users)
├─ current_question_id (text)
├─ completed_questions (jsonb array)
├─ started_at (timestamptz)
├─ completed_at (timestamptz, nullable)
└─ updated_at (timestamptz)

profiles (extended)
├─ ... (existing fields)
├─ lifestyle_issues (jsonb)        ← NEW (Q8)
├─ stress_response (jsonb)         ← NEW (Q9)
├─ work_style (text)               ← NEW (Q4)
└─ onboarding_completed (boolean)


┌─────────────────────────────────────────────────────────────────────┐
│                    QUESTION TYPES                                    │
└─────────────────────────────────────────────────────────────────────┘

text / textarea
├─ Single/multi-line input
├─ LLM extraction
└─ Confidence threshold filtering

multiple_choice
├─ Multi-select options
├─ "Other" + text input
├─ Follow-up prompt for "Other"
└─ Direct mapping to patterns

forced_choice
├─ Single-select options
├─ "Other" + text input
├─ Follow-up prompt for "Other"
└─ Direct mapping to preferences

slider
├─ Numeric scale (1-5)
├─ No LLM needed
└─ Threshold-based pattern detection


┌─────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION POINTS                                │
└─────────────────────────────────────────────────────────────────────┘

1. Signup Flow
   /signup → /auth/callback → check onboarding_completed
                                  ↓
                              /onboarding

2. Dashboard Access
   /dashboard → check onboarding_completed
                  ↓ false
              /onboarding

3. Chat System
   No integration yet (future: use onboarding context)

4. Goal/Task Creation
   Pre-seeded from onboarding (Q1, Q10)

5. Pattern Detection
   Execution patterns seeded from Q3, Q5, Q7, Q9


┌─────────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE THRESHOLDS                             │
└─────────────────────────────────────────────────────────────────────┘

High Confidence (0.75-1.0)
├─ Goals from Q1, Q10
├─ Commitments from Q10
└─ Clear multi-choice selections

Moderate Confidence (0.65-0.74)
├─ Identity signals from Q2, Q6
└─ "Other" text responses

Lower Confidence (0.50-0.64)
├─ Aspirational long-term vision (Q2)
└─ Vague or tentative statements

Below 0.50
└─ Not persisted (too uncertain)
```

## Key Design Decisions

1. **Async Extraction**: Non-blocking to keep UI responsive
2. **Confidence Filtering**: Only high-quality signals persisted
3. **Occurrence Tracking**: Patterns require 2+ mentions to surface
4. **One-at-a-time Flow**: Reduces cognitive load and drop-off
5. **Progressive Disclosure**: "Other" follow-ups only when needed
6. **Instant Save**: No data loss on navigation/refresh
7. **No Fake Data**: Dashboard empty states instead of placeholders

## Performance Characteristics

- **UI Response**: <100ms (immediate save)
- **Extraction Time**: 2-3s per text question (background)
- **LLM Calls**: 6 max per onboarding (Q1, Q2, Q3-other, Q6, Q7-other, Q10)
- **Database Writes**: ~15-20 total (responses + extracted memory)
- **Cost per User**: $0.01-0.02 (GPT-4o-mini)
