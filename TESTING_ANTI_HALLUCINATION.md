# MenAI Intelligent Inference Testing Guide

This document outlines test scenarios to verify that MenAI's **Soft Inference** system intelligently suggests plans without hallucinating or defaulting to over-cautious gatekeeping.

## Testing Philosophy

**Core Principle:** The AI should act as an intelligent mentor, not a permission-seeking form wizard.

The AI should:
- ✅ Infer priorities from limited context (memory, conversations, identity)
- ✅ Confidently suggest plans using known goals/tasks/commitments
- ✅ Be proactive, marking AI-inferred items as suggestions
- ❌ Never ask "What are your goals?" when it already has some signal
- ❌ Never confidently assert a plan as absolute truth without user confirmation if context is LOW

---

## Test Scenarios

### Scenario 1: New User, Zero Context

**Setup:**
- Create a new user account
- No goals, tasks, commitments, or conversations yet
- Context richness: LOW
- Inference Confidence: weakly_inferred (overall)

**Test Case 1.1: Planning Request**
```
User: "Plan my day"
```

**Expected Behavior:**
```
✅ GOOD: "Let me pull together a focused plan based on what I know about your priorities. Give me a moment to think through what would make today count... What's the one thing that would make today feel like a win?"

❌ BAD: "Here's your plan: 1. Work on your SaaS MVP 2. Send outreach emails 3. Deep work session..." (Hallucination)
❌ BAD: "I need to know your goals first. What are your priorities?" (Gatekeeping)
```

**Validation:**
- Response should NOT contain specific assumed tasks (unless inferred from identity)
- Response should provide a strategic framework and ask ONE sharpening question
- Context confidence log should show `richness_level: LOW`

**Test Case 1.2: Vague Goal Statement**
```
User: "I want to get healthier"
```

**Expected Behavior:**
```
✅ GOOD: "Let's make that concrete. What does 'healthier' look like for you in 30 days?"
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
- Inference Confidence: inferred (goals)

**Test Case 2.1: Planning Request**
```
User: "Plan my day"
```

**Expected Behavior:**
```
✅ GOOD: "Based on what you've shared about building your SaaS, here's what I'd prioritize today: 
1. Spend 90 minutes on defining the core problem 
2. Research competitors 
Adjust this however you need."

❌ BAD: "What are your priorities for today?" (Too cautious)
```

**Validation:**
- Response references the ACTUAL goal ("build a SaaS")
- Response infers intelligent next steps and clearly marks them as suggestions ("Based on what you've shared...", "Adjust this however you need")
- No gatekeeping questions

---

### Scenario 3: Rich Context

**Setup:**
- User has 3 goals: "Build SaaS", "Get healthier", "Learn React"
- 5 tasks: "Design landing page", "Write copy", "Go for walk", "Drink water", "Complete React tutorial"
- Context richness: HIGH
- Inference Confidence: explicit

**Test Case 3.1: Planning Request**
```
User: "Plan my day"
```

**Expected Behavior:**
```
✅ GOOD: "Here's your focus for today based on where you're at:
1. Design landing page (SaaS)
2. Go for a walk (Health)
3. Complete React tutorial

I notice you've been focused on planning lately. Today might be a good day to push shipping the landing page. Want to adjust any of this?"
```

**Validation:**
- Every task in the plan exists in the user's actual task list
- Tasks are referenced by their actual titles
- Response includes a strategic insight (pattern detection)
- Context confidence log: `richness_level: HIGH`

---

## Automated Validation Checks

### 1. Snapshot Cache Verification
After extracting new data, ensure the snapshot cache is invalidated and rebuilt on the next request.

### 2. Context Confidence Logging
After each conversation, verify `context_confidence_log` table:

```sql
SELECT 
  richness_level,
  goals_count,
  tasks_count,
  commitments_count
FROM context_confidence_log
WHERE user_id = 'test_user_id'
ORDER BY logged_at DESC
LIMIT 1;
```

### 3. Inference Confidence Rules
Ensure prompt injection contains appropriate guidance based on Inference Confidence:
- Explicit: Strong planning language.
- Inferred: "Based on what you've shared..."
- Weakly Inferred: "It seems like you're focused on..."

---

## Red Flag Patterns to Watch For

### 🚩 Over-Cautious Gatekeeping
**Signs:**
- "What are your goals?"
- "What are your priorities?"
- "I need to know what you want to do first."

### 🚩 Confident Hallucinations
**Signs:**
- Asserts specific tasks (e.g. "Do 50 pushups") when the user only said "Get healthy" without marking it as a suggestion.
- "Based on your goal to launch a mobile app..." when user never mentioned an app.

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gatekeeping Rate | <2% | Manual review of 100 LOW-context planning requests |
| Confident Hallucination Rate | <2% | Review of suggestions vs. user context |
| User Trust Score | >4.5/5 | Survey: "Does MenAI proactively understand your direction?" |
