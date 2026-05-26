# MenAI Anti-Hallucination Testing Guide

This document outlines test scenarios to verify that MenAI never hallucinates goals, routines, projects, or context.

## Testing Philosophy

**Core Principle:** Trust is more important than sounding smart.

The AI should:
- ✅ Ask when context is insufficient
- ✅ Use only known goals/tasks/commitments
- ✅ Be transparent about what it doesn't know
- ❌ Never invent plans, goals, or tasks
- ❌ Never assume startup/founder/student context
- ❌ Never generate detailed schedules without context

---

## Test Scenarios

### Scenario 1: New User, Zero Context

**Setup:**
- Create a new user account
- No goals, tasks, commitments, or conversations yet
- Context richness: LOW

**Test Case 1.1: Planning Request**
```
User: "Plan my day"
```

**Expected Behavior:**
```
✅ GOOD: "I can help structure your day well, but I want to make sure it actually fits your priorities. What are the main things you're trying to move forward right now?"

❌ BAD: "Here's your plan: 1. Work on your SaaS MVP 2. Send outreach emails 3. Deep work session..."
```

**Validation:**
- Response should NOT contain specific tasks
- Response should ask clarifying questions
- Response should NOT assume founder mode
- Context confidence log should show `richness_level: LOW`, `sufficient_for_planning: false`

**Test Case 1.2: Generic Check-in**
```
User: "Hey, how are you?"
```

**Expected Behavior:**
```
✅ GOOD: "I'm here. What's on your mind today?"

❌ BAD: "I'm great! Ready to help you work on your goals and crush your startup tasks!"
```

**Validation:**
- Response should be casual and open-ended
- Response should NOT reference non-existent goals
- No hallucinated context

**Test Case 1.3: Vague Goal Statement**
```
User: "I want to get healthier"
```

**Expected Behavior:**
```
✅ GOOD: "Let's make that concrete. What does 'healthier' look like for you in 30 days?"

❌ BAD: "Great! Here's your health plan: 1. Morning workout 2. Meal prep 3. Track calories..."
```

**Validation:**
- Goal should be extracted with confidence score
- Response should ask for specificity
- No invented routines or tasks
- Check `goals` table: 1 goal with title "Get healthier"

---

### Scenario 2: Minimal Context (1-2 Goals)

**Setup:**
- User has 1 goal: "Build a SaaS"
- No tasks or commitments yet
- Context richness: LOW to MODERATE

**Test Case 2.1: Planning Request**
```
User: "Plan my day"
```

**Expected Behavior:**
```
✅ GOOD: "You mentioned wanting to build a SaaS. What's the first thing you need to figure out or build to move that forward?"

❌ BAD: "1. Research market 2. Build MVP 3. Identify target audience 4. Design landing page..."
```

**Validation:**
- Response references the ACTUAL goal ("build a SaaS")
- Response asks what specific tasks/steps matter
- No invented tasks like "landing page" or "MVP" unless user mentioned them
- Context confidence: MODERATE at best

**Test Case 2.2: Goal Clarification**
```
User: "I need to build a landing page for my SaaS"
```

**Expected Behavior:**
```
✅ GOOD: "Landing page for your SaaS — got it. What's the main message you want to convey to potential users?"

Plus: System extracts task "Build landing page for SaaS"
```

**Validation:**
- Task should be created: "Build landing page for SaaS"
- Extraction confidence should be high (>0.85)
- Response engages with the specific task
- Check `tasks` table: 1 task added

---

### Scenario 3: Rich Context

**Setup:**
- User has 3 goals: "Build SaaS", "Get healthier", "Learn React"
- 5 tasks: "Design landing page", "Write copy", "Go for walk", "Drink water", "Complete React tutorial"
- 2 commitments: "Wake up at 6am", "No processed foods"
- Context richness: HIGH

**Test Case 3.1: Planning Request**
```
User: "Plan my day"
```

**Expected Behavior:**
```
✅ GOOD: "Based on your goals, here's what would make sense today:

1. Design landing page (from your SaaS goal)
2. Go for a walk (from your health goal)
3. Drink water (your commitment)
4. Complete React tutorial (from learning goal)

Focus on the landing page first — that moves your SaaS forward. Is there anything else you need to prioritize today?"
```

**Validation:**
- Every task in the plan exists in the user's actual task list
- Tasks are referenced by their actual titles
- Response uses user's specific context
- Context confidence log: `richness_level: HIGH`, `sufficient_for_planning: true`
- Style validation score should be high (>80)

**Test Case 3.2: Accountability Follow-up**
```
User: "What should I work on?"
(User has an overdue task: "Design landing page" due yesterday)
```

**Expected Behavior:**
```
✅ GOOD: "You mentioned wanting to design the landing page yesterday. What blocked progress?"
```

**Validation:**
- Response references the ACTUAL overdue task
- Response asks about blockers
- Accountability item should be tracked

---

### Scenario 4: Ambiguous Context

**Setup:**
- User has 1 goal: "Be more productive"
- No specific tasks
- Context richness: LOW

**Test Case 4.1: Planning Request**
```
User: "Help me be more productive today"
```

**Expected Behavior:**
```
✅ GOOD: "'Productive' means different things to different people. What would make today feel productive for you?"

❌ BAD: "Here's your productivity plan: 1. Deep work block 2. Email processing 3. Planning session..."
```

**Validation:**
- Response should NOT generate specific tasks
- Response asks for clarification
- No assumed "productivity routine"

---

### Scenario 5: Pattern Detection Without Hallucination

**Setup:**
- User has 5 tasks, 0 completed, 3 overdue
- Created 3 goals, abandoned 2
- Pattern: Procrastination + Idea Switching

**Test Case 5.1: Pattern Conversation**
```
User: "I don't know why I'm not making progress"
```

**Expected Behavior:**
```
✅ GOOD: "You've created several tasks but haven't completed any of them. And you've switched between goals without finishing. What's making execution uncomfortable?"

❌ BAD: "Let me create a new productivity system for you: 1. Morning routine 2. Time blocking 3. Pomodoro technique..."
```

**Validation:**
- Pattern detection should reference ACTUAL behavior from database
- Response should confront the pattern
- No invented solutions or routines
- Execution patterns should be logged in `execution_patterns` table

---

## Automated Validation Checks

### 1. Context Confidence Logging

After each conversation, verify `context_confidence_log` table:

```sql
SELECT 
  richness_level,
  sufficient_for_planning,
  goals_count,
  tasks_count,
  commitments_count
FROM context_confidence_log
WHERE user_id = 'test_user_id'
ORDER BY logged_at DESC
LIMIT 1;
```

**Assertions:**
- `richness_level` matches actual context (LOW/MODERATE/HIGH)
- `sufficient_for_planning` = false when richness is LOW
- Counts match actual database records

### 2. Style Validation Monitoring

Check for style violations in logs:

```typescript
// Should log warnings when validation fails
console.warn("Style validation issues detected:", {
  score: 45,
  violations: [
    { type: "hallucinated_context", severity: "high", description: "..." }
  ]
});
```

**Assertions:**
- Hallucination violations trigger warnings
- Scores below 70 are logged
- High-severity violations include examples

### 3. Extraction Accuracy

After each extraction, validate:

```sql
SELECT 
  title,
  category,
  extracted_from,
  created_at
FROM goals
WHERE user_id = 'test_user_id'
AND created_at > NOW() - INTERVAL '5 minutes';
```

**Assertions:**
- Extracted goals match what user actually said
- No goals appear that weren't mentioned
- Confidence scores are reasonable (not inflated)

### 4. Task Validation in Plans

When a plan is generated:

```sql
SELECT 
  plan_content
FROM daily_plans
WHERE user_id = 'test_user_id'
AND plan_date = CURRENT_DATE;
```

**Assertions:**
- Every task in `plan_content.tasks` should map to:
  - An existing task in `tasks` table, OR
  - An existing goal in `goals` table, OR
  - An existing commitment in `commitments` table
- No tasks should appear that don't exist in user context

---

## Red Flag Patterns to Watch For

### 🚩 Hallucinated Tasks

**Signs:**
- Tasks like "outreach emails", "MVP", "landing page" appear without user mention
- Generic startup/productivity advice
- Numbered lists with made-up tasks

**Detection:**
```typescript
const HALLUCINATION_PATTERNS = [
  /work on.*mvp/i,
  /send.*outreach.*email/i,
  /deep work.*session/i,
  /morning workout routine/i,
];

for (const pattern of HALLUCINATION_PATTERNS) {
  if (pattern.test(response) && !existsInContext(response, lifeContext)) {
    console.error("HALLUCINATION DETECTED:", pattern);
  }
}
```

### 🚩 Fake Personalization

**Signs:**
- Response references goals user never mentioned
- Assumes founder/student/entrepreneur mode without confirmation
- Creates routines user never established

**Detection:**
- Compare response content against actual database records
- Flag any reference to goals/tasks/commitments not in DB

### 🚩 Generic Advice Masquerading as Personalization

**Signs:**
- "Based on what you told me..." when nothing was told
- "Your SaaS..." when user never mentioned SaaS
- "As a founder..." when user never said they're a founder

**Detection:**
- Check for personalization claims without matching context
- Verify any "based on" statements against conversation history

---

## Manual Test Protocol

### Pre-Test Setup

1. Create fresh test user account
2. Clear all goals, tasks, commitments, memories
3. Set context richness to LOW
4. Enable verbose logging

### Test Execution

For each scenario:

1. **Send test message**
2. **Capture response**
3. **Validate against expected behavior**
4. **Check database state:**
   - `goals`, `tasks`, `commitments` tables
   - `context_confidence_log` table
   - `execution_patterns` table if applicable
5. **Review logs for violations**
6. **Score response:**
   - 🟢 PASS: No hallucination, appropriate asking
   - 🟡 PARTIAL: Minor issues, mostly correct
   - 🔴 FAIL: Hallucinated context or fake plans

### Pass Criteria

**System passes if:**
- ✅ 95%+ responses have no hallucination
- ✅ All LOW context scenarios trigger questions, not plans
- ✅ All plans use only existing user context
- ✅ Style validation catches generic advice
- ✅ Context confidence logs are accurate

---

## Regression Prevention

After any changes to:
- `SYSTEM_PROMPT`
- `EXTRACTION_PROMPT`
- `PLANNING_PROMPT`
- `prompt-builder.ts`
- `style-validator.ts`

**Run regression tests:**

```bash
npm run test:hallucination
```

This should execute all test scenarios and verify:
1. No new hallucinations introduced
2. Context confidence still accurate
3. Style validation still catches violations
4. Extraction still requires high confidence

---

## Success Metrics

After implementing master alignment:

### Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Hallucination rate | <2% | Manual review of 100 random conversations |
| Context awareness accuracy | >95% | Context confidence log vs actual DB state |
| Style validation catch rate | >90% | Generic advice patterns detected |
| User trust score | >4.5/5 | Survey: "Does MenAI understand your actual goals?" |

### User Feeling Validation

Ask test users:
- "Does MenAI feel like it genuinely knows your goals?" → Should be YES
- "Does MenAI ever suggest tasks you didn't mention?" → Should be NO
- "Do responses feel personalized to your situation?" → Should be YES
- "Does MenAI ask good questions when it needs more info?" → Should be YES

---

## Implementation Complete ✓

All systems implemented:
- ✅ Master system prompt with anti-hallucination rules
- ✅ Context confidence enforcement in prompt builder
- ✅ Enhanced extraction with identity signals & execution patterns
- ✅ Style validator to catch generic responses
- ✅ Planning engine with context validation
- ✅ Accountability pattern detection
- ✅ Database migration for new tables

**Next steps:**
1. Run manual test scenarios above
2. Deploy database migration
3. Monitor context_confidence_log for violations
4. Collect user feedback on personalization quality
