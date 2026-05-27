/**
 * Onboarding Memory Extraction Service
 * Extracts memory from onboarding questionnaire responses
 */

import { createClient } from "@/lib/supabase/client";
import { getOpenAI } from "@/lib/ai/openai";

interface ExtractionResult {
  goals?: Array<{ title: string; category: string; priority: string; confidence: number }>;
  commitments?: Array<{ description: string; category: string; timeframe: string; confidence: number }>;
  identitySignals?: Array<{ type: string; description: string; longTermDirection: string; confidence: number }>;
  executionPatterns?: Array<{ pattern: string; trigger: string; frequency: string; severity: string; behavioralImpact: string; confidence: number }>;
  values?: string[];
  lifestyleIssues?: string[];
  stressResponse?: string[];
  workStyle?: string;
}

// Question mapping to extraction logic
const QUESTION_EXTRACTORS: Record<string, (response: string, responseData: any) => Promise<ExtractionResult>> = {
  Q1: extractGoalsFromQ1,
  Q2: extractLongTermVision,
  Q3: extractExecutionBlockers,
  Q4: extractWorkStyle,
  Q5: extractHesitationLevel,
  Q6: extractMotivation,
  Q7: extractFrictionPoint,
  Q8: extractLifestyleIssues,
  Q9: extractStressResponse,
  Q10: extractInitialCommitment,
};

/**
 * Main extraction entry point
 */
export async function extractOnboardingMemory(
  userId: string,
  questionId: string,
  response: string | null,
  responseData: any
): Promise<void> {
  const extractor = QUESTION_EXTRACTORS[questionId];
  if (!extractor) {
    console.log(`No extractor defined for question ${questionId}`);
    return;
  }

  try {
    const extracted = await extractor(response || "", responseData);
    await persistExtractedMemory(userId, questionId, extracted);
    
    // Mark response as processed
    const supabase = createClient();
    await supabase
      .from("onboarding_responses")
      .update({ processed: true })
      .eq("user_id", userId)
      .eq("question_id", questionId);
    
    console.log(`Extracted memory for ${questionId}:`, extracted);
  } catch (error) {
    console.error(`Extraction error for ${questionId}:`, error);
    throw error;
  }
}

/**
 * Q1: "What are you trying to build toward right now?"
 */
async function extractGoalsFromQ1(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 3) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Extract primary goal from this statement. Return ONLY valid JSON:
{
  "title": "goal title (concise)",
  "category": "startup|fitness|financial|relationship|learning|identity|health|career|other",
  "priority": "high",
  "confidence": 0.8-0.95
}

Only extract if confidence > 0.75. If unclear, return empty object {}.`
      },
      {
        role: "user",
        content: response
      }
    ],
    temperature: 0.3,
  });

  const result = completion.choices[0].message.content;
  if (!result) return {};

  try {
    const parsed = JSON.parse(result);
    if (parsed.confidence && parsed.confidence > 0.75) {
      return { goals: [parsed] };
    }
  } catch (e) {
    console.error("Q1 parse error:", e);
  }

  return {};
}

/**
 * Q2: "If the next 3 years went perfectly, what would look different?"
 */
async function extractLongTermVision(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 10) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Extract long-term goals and values. Return ONLY valid JSON:
{
  "goals": [{"title": "...", "category": "startup|...", "priority": "medium", "confidence": 0.5-0.8}],
  "identitySignals": [{"type": "founder|creator|self-discipline|leadership|other", "description": "...", "longTermDirection": "...", "confidence": 0.5-0.8}],
  "values": ["freedom", "family", "impact", ...]
}

This is aspirational, so use moderate confidence (0.5-0.8). Extract key themes.`
      },
      {
        role: "user",
        content: response
      }
    ],
    temperature: 0.3,
  });

  const result = completion.choices[0].message.content;
  if (!result) return {};

  try {
    return JSON.parse(result);
  } catch (e) {
    console.error("Q2 parse error:", e);
    return {};
  }
}

/**
 * Q3: "What usually stops your momentum?" (Multiple choice)
 */
async function extractExecutionBlockers(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected || [];
  if (selected.length === 0 && !response) {
    return {};
  }

  const patterns: ExtractionResult["executionPatterns"] = [];

  // Map choices to patterns
  const patternMap: Record<string, { pattern: string; behavioralImpact: string }> = {
    overthinking: { pattern: "overthinking", behavioralImpact: "Analysis paralysis prevents action" },
    perfectionism: { pattern: "perfectionism", behavioralImpact: "Never ships until everything feels perfect" },
    burnout: { pattern: "burnout", behavioralImpact: "Energy depletes, can't sustain pace" },
    distraction: { pattern: "scattered_focus", behavioralImpact: "Attention shifts before completion" },
    lack_of_clarity: { pattern: "avoidance", behavioralImpact: "Unclear direction leads to postponement" },
    fear_of_failure: { pattern: "avoidance", behavioralImpact: "Fear prevents starting or shipping" },
  };

  for (const choice of selected) {
    const mapped = patternMap[choice.toLowerCase().replace(/\s+/g, "_")];
    if (mapped) {
      patterns.push({
        pattern: mapped.pattern,
        trigger: "self-reported",
        frequency: "frequent",
        severity: "medium",
        behavioralImpact: mapped.behavioralImpact,
        confidence: 0.85,
      });
    }
  }

  // If "Other" response, use LLM to extract
  if (response && response.trim().length > 5) {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Extract execution pattern from this blocker description. Return ONLY valid JSON:
{
  "pattern": "overthinking|procrastination|avoidance|perfectionism|scattered_focus|inconsistency|burnout",
  "trigger": "what triggers it",
  "frequency": "frequent",
  "severity": "medium|high",
  "behavioralImpact": "how it affects execution",
  "confidence": 0.7-0.9
}`
        },
        {
          role: "user",
          content: response
        }
      ],
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;
    if (result) {
      try {
        const parsed = JSON.parse(result);
        if (parsed.confidence > 0.7) {
          patterns.push(parsed);
        }
      } catch (e) {
        console.error("Q3 Other parse error:", e);
      }
    }
  }

  return patterns.length > 0 ? { executionPatterns: patterns } : {};
}

/**
 * Q4: "What feels more natural to you?" (Forced choice)
 */
async function extractWorkStyle(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  
  if (selected) {
    const styles: Record<string, string> = {
      planning: "planning",
      building: "building",
      exploring: "exploring",
      refining: "refining",
    };
    
    const style = styles[selected.toLowerCase()];
    if (style) {
      return { workStyle: style };
    }
  }

  // If "Other", store the custom text
  if (response && response.trim().length > 3) {
    return { workStyle: response.trim() };
  }

  return {};
}

/**
 * Q5: Hesitation slider (1-5)
 */
async function extractHesitationLevel(response: string, responseData: any): Promise<ExtractionResult> {
  const level = responseData?.value || parseInt(response);
  
  if (isNaN(level) || level < 1 || level > 5) {
    return {};
  }

  // If level >= 4, flag overthinking pattern
  if (level >= 4) {
    return {
      executionPatterns: [{
        pattern: "overthinking",
        trigger: "decision pressure",
        frequency: level === 5 ? "constant" : "frequent",
        severity: level === 5 ? "high" : "medium",
        behavioralImpact: "Delays action due to excessive planning",
        confidence: 0.8,
      }],
    };
  }

  return {};
}

/**
 * Q6: "Why does building something of your own matter to you?"
 */
async function extractMotivation(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 10) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Extract identity signals and values. Return ONLY valid JSON:
{
  "identitySignals": [{"type": "founder|creator|self-discipline|leadership|other", "description": "...", "longTermDirection": "...", "confidence": 0.7-0.9}],
  "values": ["autonomy", "impact", "freedom", "challenge", ...]
}

Focus on intrinsic motivation. Extract key themes.`
      },
      {
        role: "user",
        content: response
      }
    ],
    temperature: 0.3,
  });

  const result = completion.choices[0].message.content;
  if (!result) return {};

  try {
    return JSON.parse(result);
  } catch (e) {
    console.error("Q6 parse error:", e);
    return {};
  }
}

/**
 * Q7: "What part of this process feels heaviest right now?"
 */
async function extractFrictionPoint(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  
  const frictionMap: Record<string, { pattern: string; impact: string }> = {
    starting: { pattern: "avoidance", impact: "Difficulty initiating tasks" },
    committing: { pattern: "inconsistency", impact: "Struggles with commitment" },
    finishing: { pattern: "perfectionism", impact: "Can't complete and ship" },
    staying_consistent: { pattern: "inconsistency", impact: "Follow-through varies" },
    narrowing_focus: { pattern: "scattered_focus", impact: "Too many priorities" },
  };

  if (selected) {
    const key = selected.toLowerCase().replace(/\s+/g, "_");
    const mapped = frictionMap[key];
    
    if (mapped) {
      return {
        executionPatterns: [{
          pattern: mapped.pattern,
          trigger: "execution stage friction",
          frequency: "frequent",
          severity: "medium",
          behavioralImpact: mapped.impact,
          confidence: 0.8,
        }],
      };
    }
  }

  // Handle "Other" text response
  if (response && response.trim().length > 5) {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Extract execution pattern from friction point. Return JSON with pattern, behavioralImpact, confidence.`
        },
        {
          role: "user",
          content: response
        }
      ],
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;
    if (result) {
      try {
        const parsed = JSON.parse(result);
        if (parsed.confidence > 0.7) {
          return {
            executionPatterns: [{
              ...parsed,
              trigger: "execution friction",
              frequency: "frequent",
              severity: "medium",
            }],
          };
        }
      } catch (e) {
        console.error("Q7 Other parse error:", e);
      }
    }
  }

  return {};
}

/**
 * Q8: "What currently feels most unstable in your life?"
 */
async function extractLifestyleIssues(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected || [];
  
  if (selected.length === 0 && !response) {
    return {};
  }

  const issues: string[] = [];

  for (const choice of selected) {
    issues.push(choice.toLowerCase());
  }

  if (response && response.trim().length > 3) {
    issues.push(response.trim());
  }

  return issues.length > 0 ? { lifestyleIssues: issues } : {};
}

/**
 * Q9: "When you feel overwhelmed, what do you usually do?"
 */
async function extractStressResponse(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected || [];
  
  if (selected.length === 0 && !response) {
    return {};
  }

  const responses: string[] = [];
  const patterns: ExtractionResult["executionPatterns"] = [];

  const responseMap: Record<string, { label: string; pattern?: string }> = {
    avoid_tasks: { label: "avoid tasks", pattern: "avoidance" },
    overplan: { label: "overplan", pattern: "overthinking" },
    distract_myself: { label: "distract", pattern: "scattered_focus" },
    work_harder: { label: "work harder", pattern: "burnout" },
    shut_down: { label: "shut down", pattern: "burnout" },
    start_something_new: { label: "start new", pattern: "scattered_focus" },
  };

  for (const choice of selected) {
    const key = choice.toLowerCase().replace(/\s+/g, "_");
    const mapped = responseMap[key];
    
    if (mapped) {
      responses.push(mapped.label);
      
      if (mapped.pattern) {
        patterns.push({
          pattern: mapped.pattern,
          trigger: "overwhelm",
          frequency: "frequent",
          severity: "medium",
          behavioralImpact: `Responds to stress by ${mapped.label}`,
          confidence: 0.8,
        });
      }
    }
  }

  if (response && response.trim().length > 3) {
    responses.push(response.trim());
  }

  const result: ExtractionResult = {};
  if (responses.length > 0) {
    result.stressResponse = responses;
  }
  if (patterns.length > 0) {
    result.executionPatterns = patterns;
  }

  return result;
}

/**
 * Q10: "What is one thing you want to complete in the next 30 days?"
 */
async function extractInitialCommitment(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 3) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Extract commitment with timeframe. Return ONLY valid JSON:
{
  "description": "what they want to complete",
  "category": "health|work|relationships|personal|other",
  "timeframe": "this_week|ongoing",
  "confidence": 0.8-0.95
}

This is a 30-day commitment. Use timeframe "ongoing".`
      },
      {
        role: "user",
        content: response
      }
    ],
    temperature: 0.3,
  });

  const result = completion.choices[0].message.content;
  if (!result) return {};

  try {
    const parsed = JSON.parse(result);
    if (parsed.confidence && parsed.confidence > 0.75) {
      return { commitments: [parsed] };
    }
  } catch (e) {
    console.error("Q10 parse error:", e);
  }

  return {};
}

/**
 * Persist extracted memory to database
 */
async function persistExtractedMemory(
  userId: string,
  questionId: string,
  extracted: ExtractionResult
): Promise<void> {
  const supabase = createClient();

  // Insert goals
  if (extracted.goals && extracted.goals.length > 0) {
    for (const goal of extracted.goals) {
      if (goal.confidence > 0.75) {
        await supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          category: goal.category,
          priority: goal.priority,
          status: "active",
        });
      }
    }
  }

  // Insert commitments
  if (extracted.commitments && extracted.commitments.length > 0) {
    for (const commitment of extracted.commitments) {
      if (commitment.confidence > 0.75) {
        await supabase.from("commitments").insert({
          user_id: userId,
          description: commitment.description,
          status: "active",
        });
      }
    }
  }

  // Insert identity signals
  if (extracted.identitySignals && extracted.identitySignals.length > 0) {
    for (const signal of extracted.identitySignals) {
      if (signal.confidence > 0.65) {
        await supabase.from("identity_signals").insert({
          user_id: userId,
          type: signal.type,
          description: signal.description,
          long_term_direction: signal.longTermDirection,
          confidence: signal.confidence,
        });
      }
    }
  }

  // Insert or update execution patterns
  if (extracted.executionPatterns && extracted.executionPatterns.length > 0) {
    for (const pattern of extracted.executionPatterns) {
      if (pattern.confidence > 0.7) {
        // Check if pattern already exists
        const { data: existing } = await supabase
          .from("execution_patterns")
          .select("id, occurrences")
          .eq("user_id", userId)
          .eq("pattern", pattern.pattern)
          .single();

        if (existing) {
          // Update existing pattern
          await supabase
            .from("execution_patterns")
            .update({
              occurrences: existing.occurrences + 1,
              last_detected: new Date().toISOString(),
              frequency: pattern.frequency,
              severity: pattern.severity,
            })
            .eq("id", existing.id);
        } else {
          // Insert new pattern
          await supabase.from("execution_patterns").insert({
            user_id: userId,
            pattern: pattern.pattern,
            trigger: pattern.trigger,
            frequency: pattern.frequency,
            severity: pattern.severity,
            behavioral_impact: pattern.behavioralImpact,
            confidence: pattern.confidence,
            occurrences: 1,
          });
        }
      }
    }
  }

  // Update profile with lifestyle issues, stress response, work style
  const profileUpdates: any = {};
  
  if (extracted.lifestyleIssues) {
    profileUpdates.lifestyle_issues = extracted.lifestyleIssues;
  }
  
  if (extracted.stressResponse) {
    profileUpdates.stress_response = extracted.stressResponse;
  }
  
  if (extracted.workStyle) {
    profileUpdates.work_style = extracted.workStyle;
  }

  if (Object.keys(profileUpdates).length > 0) {
    await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);
  }

  console.log(`Persisted memory for ${questionId}:`, {
    goals: extracted.goals?.length || 0,
    commitments: extracted.commitments?.length || 0,
    identitySignals: extracted.identitySignals?.length || 0,
    patterns: extracted.executionPatterns?.length || 0,
  });
}
