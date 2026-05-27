# MenAI Onboarding System Implementation

## Overview

The MenAI onboarding system is a comprehensive multi-stage questionnaire that seeds the AI's memory with initial user context. It follows behavioral science principles and UX best practices to minimize drop-off while gathering high-quality trajectory signals.

## Architecture

### Components

1. **Database Layer** (`009_onboarding_system.sql`)
   - `onboarding_responses`: Stores individual question responses
   - `onboarding_progress`: Tracks user progress through the flow
   - Profile extensions: `lifestyle_issues`, `stress_response`, `work_style`

2. **API Routes**
   - `/api/onboarding/answer` (POST): Save individual responses
   - `/api/onboarding/progress` (GET/POST): Track and update progress

3. **Extraction Engine** (`src/lib/ai/onboarding-extraction.ts`)
   - Question-specific extractors (Q1-Q10)
   - LLM-powered extraction for open-ended responses
   - Confidence-based persistence (only high-confidence extractions saved)

4. **UI Component** (`src/app/onboarding/page.tsx`)
   - One-question-at-a-time flow
   - Progress indicator
   - Multiple question types: text, textarea, multiple choice, forced choice, slider
   - "Other" option branching with follow-up prompts

5. **Question Configuration** (`src/lib/onboarding/questions.ts`)
   - Centralized question definitions
   - Flow control
   - Prompt variants (concise, conversational, mentor)

## Question Flow

### Phase 1: Trajectory & Vision
- **Q1**: "What are you trying to build toward right now?" (textarea)
  - Extracts: Primary goals
  - Confidence threshold: 0.75+
  
- **Q2**: "If the next 3 years went perfectly, what would look different?" (textarea, optional)
  - Extracts: Long-term goals, identity signals, values
  - Confidence threshold: 0.5+ (aspirational)

### Phase 2: Execution Patterns
- **Q3**: "What usually stops your momentum?" (multiple choice + other)
  - Options: Overthinking, Perfectionism, Burnout, Distraction, Lack of Clarity, Fear of Failure
  - Extracts: Execution patterns with 0.85 confidence
  - LLM extraction for "Other" responses

- **Q4**: "What feels more natural to you?" (forced choice + other)
  - Options: Planning, Building, Exploring, Refining
  - Extracts: Work style preference

- **Q5**: "How often do you delay taking action?" (slider 1-5)
  - Extracts: Overthinking pattern if level >= 4
  - Direct numeric confidence

### Phase 3: Motivation & Identity
- **Q6**: "Why does building something of your own matter to you?" (textarea)
  - Extracts: Identity signals, values
  - Confidence threshold: 0.7+

- **Q7**: "What part of this process feels heaviest?" (forced choice + other)
  - Options: Starting, Committing, Finishing, Staying Consistent, Narrowing Focus
  - Extracts: Friction-point-specific execution patterns

### Phase 4: Life & Balance
- **Q8**: "What currently feels most unstable?" (forced choice + other)
  - Options: Sleep, Focus, Consistency, Direction, Energy, Relationships, Confidence
  - Extracts: Lifestyle issues (stored in profile)

- **Q9**: "When you feel overwhelmed, what do you usually do?" (forced choice + other)
  - Options: Avoid tasks, Overplan, Distract myself, Work harder, Shut down, Start something new
  - Extracts: Stress response patterns

### Phase 5: Initial Commitments
- **Q10**: "What is one thing you want to complete in the next 30 days?" (text)
  - Extracts: 30-day commitment with timeframe
  - Confidence threshold: 0.75+

## Extraction Pipeline

```
User Answer → API Save → Background Extraction → Memory Persistence → Snapshot Rebuild → Dashboard Update
```

### Extraction Process

1. **Immediate Save**: Answer saved to `onboarding_responses` with `processed: false`
2. **Background Extraction**: Non-blocking async extraction via `extractOnboardingMemory()`
3. **LLM Processing**: Question-specific extractors use GPT-4o-mini for structured extraction
4. **Confidence Filtering**: Only items above threshold are persisted
5. **Database Write**: Extracted memory written to respective tables:
   - `goals`: High-priority goals
   - `commitments`: Time-bound commitments
   - `identity_signals`: Identity aspirations
   - `execution_patterns`: Behavioral patterns (with occurrence tracking)
   - `profiles`: Lifestyle issues, stress responses, work style

### Memory Schema

```typescript
interface ExtractionResult {
  goals?: Array<{
    title: string;
    category: string;
    priority: string;
    confidence: number;
  }>;
  commitments?: Array<{
    description: string;
    category: string;
    timeframe: string;
    confidence: number;
  }>;
  identitySignals?: Array<{
    type: string;
    description: string;
    longTermDirection: string;
    confidence: number;
  }>;
  executionPatterns?: Array<{
    pattern: string;
    trigger: string;
    frequency: string;
    severity: string;
    behavioralImpact: string;
    confidence: number;
  }>;
  values?: string[];
  lifestyleIssues?: string[];
  stressResponse?: string[];
  workStyle?: string;
}
```

## Dashboard Integration

After onboarding completion:

1. **Progress Update**: `onboarding_completed: true` set in profiles
2. **Snapshot Rebuild**: `/api/dashboard/snapshot` triggered to generate initial intelligence
3. **Dashboard Redirect**: User redirected to dashboard with synthesized insights

### Initial Dashboard State

From onboarding seeds:
- **Current Direction**: Synthesized from goals + identity signals + commitments
- **AI Observation**: Generated from execution patterns (requires 2+ occurrences)
- **Active Focus**: Derived from tasks/goals (if any commitments extracted)
- **Commitments**: Displayed with consistency tracking initialized
- **Suggested Next Steps**: Pattern-based suggestions (e.g., if "overthinking", suggest "Reduce MVP scope")
- **Momentum Trend**: Initially null (requires 30 days of data)

## UX Best Practices Implemented

1. **Progress Indicator**: Visual bar showing completion percentage
2. **One-Question-at-a-Time**: Reduces cognitive load
3. **Instant Save**: No data loss on navigation
4. **Optional Questions**: Q2 can be skipped
5. **"Other" Branching**: Follow-up prompts for custom responses
6. **Clear Prompts**: Three style variants (concise, conversational, mentor)
7. **No Generic Defaults**: All extractions are user-specific, confidence-filtered

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] User can navigate through all 10 questions
- [ ] Text inputs save correctly
- [ ] Multiple choice selections persist
- [ ] Slider values are captured
- [ ] "Other" option triggers follow-up prompt
- [ ] Skip button works for optional questions
- [ ] Progress bar updates correctly
- [ ] Extraction runs without blocking UI
- [ ] Extracted memory appears in database
- [ ] Dashboard redirects after completion
- [ ] Dashboard shows synthesized intelligence
- [ ] Onboarding redirect works for incomplete users

## Configuration

### Adjusting Confidence Thresholds

Edit `src/lib/ai/onboarding-extraction.ts`:

```typescript
// Example: Lower threshold for aspirational goals
if (parsed.confidence && parsed.confidence > 0.65) { // was 0.75
  return { goals: [parsed] };
}
```

### Adding New Questions

1. Define question in `src/lib/onboarding/questions.ts`
2. Add to `QUESTION_ORDER`
3. Create extractor in `onboarding-extraction.ts`
4. Add to `QUESTION_EXTRACTORS` map

### Customizing Prompts

Edit prompt variants in `questions.ts`:

```typescript
{
  id: "Q1",
  prompt: "What are you trying to build toward right now?",
  promptVariant: "concise", // or "conversational", "mentor"
}
```

## Performance Considerations

- **Extraction is async**: Non-blocking, runs in background
- **LLM calls**: Each open-ended question uses GPT-4o-mini (~$0.01 per onboarding)
- **Database writes**: Batched per question, not per keystroke
- **Snapshot rebuild**: Triggered once at end, not per question

## Security

- **Row Level Security**: All tables have RLS policies
- **User isolation**: All queries filtered by `auth.uid()`
- **No PII in responses**: Open-ended text stored as-is, not shared with third parties
- **LLM prompts**: No user identifiers sent to OpenAI

## Future Enhancements

1. **Adaptive questioning**: Skip Q3 if Q5 indicates low hesitation
2. **Localization**: Multi-language support with cultural adjustments
3. **Resume capability**: Save partial progress, allow return later
4. **Analytics**: Track drop-off rates per question
5. **A/B testing**: Test different prompt variants
6. **Voice input**: Allow audio responses for text questions

## Troubleshooting

### Extraction not running
- Check `processed: false` in `onboarding_responses`
- Verify OpenAI API key is set
- Check server logs for extraction errors

### Dashboard shows empty state
- Confirm `onboarding_completed: true` in profiles
- Verify extracted data exists in `goals`, `execution_patterns`, etc.
- Trigger manual snapshot rebuild: `POST /api/dashboard/snapshot`

### User stuck on question
- Check browser console for API errors
- Verify `onboarding_progress` table is writable
- Test with simpler answers (avoid special characters)

## Code Locations

- **Migration**: `supabase/migrations/009_onboarding_system.sql`
- **API**: `src/app/api/onboarding/{answer,progress}/route.ts`
- **Extraction**: `src/lib/ai/onboarding-extraction.ts`
- **Questions**: `src/lib/onboarding/questions.ts`
- **UI**: `src/app/onboarding/page.tsx`
- **Dashboard Check**: `src/app/dashboard/page.tsx` (lines 40-60)

---

Built with behavioral science principles and UX research to seed MenAI's memory without overwhelming users.
