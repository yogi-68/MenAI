/**
 * Onboarding Memory Extraction Service - Updated for Domain-Agnostic Questions
 * Extracts memory from onboarding questionnaire responses
 */

import { createClient } from "@/lib/supabase/client";
import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";

interface ExtractionResult {
  goals?: Array<{ title: string; category: string; priority: string; confidence: number }>;
  commitments?: Array<{ description: string; category: string; timeframe: string; confidence: number }>;
  identitySignals?: Array<{ type: string; description: string; longTermDirection: string; confidence: number }>;
  executionPatterns?: Array<{ pattern: string; trigger: string; frequency: string; severity: string; behavioralImpact: string; confidence: number }>;
  values?: string[];
  obstacles?: string[];
  supportStyle?: string;
  reflectionFrequency?: string;
  dailyPriorities?: string[];
}

// Question mapping — aligned with ONBOARDING_QUESTIONS (execution system, not profile)
const QUESTION_EXTRACTORS: Record<string, (response: string, responseData: any) => Promise<ExtractionResult>> = {
  Q1: extractDirectionAreas,
  Q1B: extractBusinessBuilding,
  Q2: extractInitialCommitment,
  Q3: extractDeadlineFrame,
  Q4: extractObstaclePattern,
  Q5: extractCoachingStyle,
  Q6: extractReflectionFrequency,
  Q7: extractSuccessCriteria,
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

/** Q1: direction multi-select → goals + identity signals */
async function extractDirectionAreas(
  response: string,
  responseData: { selected?: string | string[] }
): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  const areas = Array.isArray(selected) ? selected : selected ? [selected] : [];
  if (areas.length === 0) {
    return extractPersonalGoals(response, responseData);
  }

  const goals = areas.map((area) => ({
    title: area.replace(/_/g, " "),
    category: "personal_growth",
    priority: "high" as const,
    confidence: 0.9,
  }));

  const identitySignals = areas.map((area) => ({
    type: "direction",
    description: area.replace(/_/g, " "),
    longTermDirection: area.replace(/_/g, " "),
    confidence: 0.9,
  }));

  return { goals, identitySignals };
}

/** Q4: deadline frame (30/60/90) */
async function extractDeadlineFrame(
  _response: string,
  responseData: { selected?: string }
): Promise<ExtractionResult> {
  const days = responseData?.selected;
  if (!days) return {};
  return {
    commitments: [
      {
        description: `${days}-day initiative horizon`,
        category: "personal",
        timeframe: `${days}_days`,
        confidence: 0.85,
      },
    ],
  };
}

/** Q5: obstacle pattern from forced choice */
async function extractObstaclePattern(
  _response: string,
  responseData: { selected?: string }
): Promise<ExtractionResult> {
  const key = responseData?.selected;
  if (!key) return {};

  const patternMap: Record<
    string,
    { pattern: string; trigger: string; behavioralImpact: string }
  > = {
    overthinking: {
      pattern: "overthinking",
      trigger: "Uncertainty before committing",
      behavioralImpact: "Delays shipping and gathering real feedback",
    },
    procrastination: {
      pattern: "procrastination",
      trigger: "Task feels large or unclear",
      behavioralImpact: "Important work gets postponed",
    },
    burnout: {
      pattern: "burnout",
      trigger: "Sustained high load without recovery",
      behavioralImpact: "Energy drops and consistency breaks",
    },
    scattered_focus: {
      pattern: "scattered_focus",
      trigger: "Too many open threads",
      behavioralImpact: "Progress spreads thin across goals",
    },
    scattered_focus_priorities: {
      pattern: "scattered_focus",
      trigger: "Competing priorities",
      behavioralImpact: "Hard to protect one initiative at a time",
    },
    inconsistency: {
      pattern: "inconsistency",
      trigger: "Irregular follow-through",
      behavioralImpact: "Momentum resets frequently",
    },
    avoidance: {
      pattern: "avoidance",
      trigger: "Fear of failure or judgment",
      behavioralImpact: "High-value tasks get skipped",
    },
  };

  const mapped = patternMap[key];
  if (!mapped) return { obstacles: [key] };

  return {
    obstacles: [key],
    executionPatterns: [
      {
        ...mapped,
        frequency: "frequent",
        severity: "medium",
        confidence: 0.85,
      },
    ],
  };
}

/** Q6: daily task preference → support/planning style */
async function extractPlanningStyle(
  _response: string,
  responseData: { selected?: string }
): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  if (!selected) return {};

  const styleMap: Record<string, string> = {
    small_actions: "gentle",
    balanced: "balanced",
    aggressive: "direct",
  };

  return { supportStyle: styleMap[selected] || selected };
}

/** Q1B: founder — what they're building */
async function extractBusinessBuilding(
  response: string,
  _responseData: unknown
): Promise<ExtractionResult> {
  if (!response?.trim()) return {};
  return {
    identitySignals: [
      {
        type: "direction",
        description: `Building ${response.trim()}`,
        longTermDirection: response.trim(),
        confidence: 0.92,
      },
    ],
  };
}

/** Q5: coaching style preference */
async function extractCoachingStyle(
  _response: string,
  responseData: { selected?: string }
): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  if (!selected) return {};
  const map: Record<string, string> = {
    supportive: "gentle",
    balanced: "balanced",
    direct: "direct",
  };
  return { supportStyle: map[selected] || selected };
}

/** Q7: success criteria for initiative */
async function extractSuccessCriteria(
  response: string,
  _responseData: unknown
): Promise<ExtractionResult> {
  if (!response?.trim()) return {};
  return {
    commitments: [
      {
        description: response.trim(),
        category: "personal",
        timeframe: "30_days",
        confidence: 0.9,
      },
    ],
  };
}

/**
 * Q1: "What's most important to you right now in your life?"
 */
async function extractPersonalGoals(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 3) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    messages: [
      {
        role: "system",
        content: `Extract primary goals from this statement. Return ONLY valid JSON:
{
  "goals": [
    {
      "title": "goal title (concise)",
      "category": "personal_growth|health_fitness|career_work|relationships|creativity|learning|finances|other",
      "priority": "high|medium|low",
      "confidence": 0.8-0.95
    }
  ]
}

Only extract goals with confidence > 0.75. Can return multiple goals. If unclear, return empty object {}.`
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
    if (parsed.goals && parsed.goals.length > 0) {
      const validGoals = parsed.goals.filter((g: any) => g.confidence > 0.75);
      return validGoals.length > 0 ? { goals: validGoals } : {};
    }
  } catch (e) {
    console.error("Q1 parse error:", e);
  }

  return {};
}

/**
 * Q2: "Where do you see yourself in a year? What would success look like?"
 */
async function extractFutureVision(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 10) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    messages: [
      {
        role: "system",
        content: `Extract long-term goals and values. Return ONLY valid JSON:
{
  "goals": [{"title": "...", "category": "...", "priority": "medium", "confidence": 0.5-0.8}],
  "identitySignals": [{"type": "growth|achievement|connection|impact|freedom", "description": "...", "longTermDirection": "...", "confidence": 0.5-0.8}],
  "values": ["growth", "family", "impact", "balance", ...]
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
 * Q3: "What obstacles are you facing?" (Multiple choice)
 */
async function extractObstacles(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected || [];
  if (selected.length === 0 && !response) {
    return {};
  }

  const obstacles: string[] = [];
  const patterns: ExtractionResult["executionPatterns"] = [];

  // Map choices to patterns
  const patternMap: Record<string, { obstacle: string; pattern?: string; impact?: string }> = {
    time_management: { 
      obstacle: "time_management", 
      pattern: "scattered_focus", 
      impact: "Struggles to manage time effectively" 
    },
    motivation: { 
      obstacle: "motivation", 
      pattern: "inconsistency", 
      impact: "Motivation fluctuates, affecting consistency" 
    },
    stress: { 
      obstacle: "stress", 
      pattern: "burnout", 
      impact: "Stress levels impact execution" 
    },
    relationships: { 
      obstacle: "relationships",
      pattern: undefined,
      impact: undefined
    },
    health: { 
      obstacle: "health",
      pattern: undefined,
      impact: undefined
    },
    career_uncertainty: { 
      obstacle: "career_uncertainty", 
      pattern: "avoidance", 
      impact: "Career uncertainty creates paralysis" 
    },
    financial_concerns: { 
      obstacle: "financial_concerns",
      pattern: undefined,
      impact: undefined
    },
  };

  for (const choice of selected) {
    const key = choice.toLowerCase().replace(/\s+/g, "_");
    const mapped = patternMap[key];
    
    if (mapped) {
      obstacles.push(mapped.obstacle);
      
      if (mapped.pattern && mapped.impact) {
        patterns.push({
          pattern: mapped.pattern,
          trigger: "life obstacles",
          frequency: "frequent",
          severity: "medium",
          behavioralImpact: mapped.impact,
          confidence: 0.75,
        });
      }
    }
  }

  // If "Other" response, use LLM
  if (response && response.trim().length > 5) {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        {
          role: "system",
          content: `Extract obstacle and execution pattern. Return ONLY valid JSON:
{
  "obstacle": "brief description",
  "pattern": "overthinking|procrastination|avoidance|perfectionism|scattered_focus|inconsistency|burnout",
  "trigger": "what triggers it",
  "frequency": "frequent",
  "severity": "medium|high",
  "behavioralImpact": "how it affects life",
  "confidence": 0.7-0.9
}

If no clear execution pattern, omit pattern field.`
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
        if (parsed.obstacle) {
          obstacles.push(parsed.obstacle);
        }
        if (parsed.pattern && parsed.confidence > 0.7) {
          patterns.push(parsed);
        }
      } catch (e) {
        console.error("Q3 Other parse error:", e);
      }
    }
  }

  const extractedResult: ExtractionResult = {};
  if (obstacles.length > 0) extractedResult.obstacles = obstacles;
  if (patterns.length > 0) extractedResult.executionPatterns = patterns;
  return extractedResult;
}

/**
 * Q4: "What do you want to focus on daily?" (Multiple choice)
 */
async function extractDailyPriorities(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected || [];
  if (selected.length === 0 && !response) {
    return {};
  }

  const priorities: string[] = [];

  for (const choice of selected) {
    priorities.push(choice.toLowerCase().replace(/\s+/g, "_"));
  }

  if (response && response.trim().length > 3) {
    priorities.push(response.trim());
  }

  return priorities.length > 0 ? { dailyPriorities: priorities } : {};
}

/**
 * Q5: "How do you prefer guidance?" (Forced choice)
 */
async function extractSupportStyle(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  
  if (selected) {
    const styles: Record<string, string> = {
      gentle: "gentle",
      direct: "direct",
      balanced: "balanced",
      strategic: "strategic",
    };
    
    const style = styles[selected.toLowerCase()];
    if (style) {
      return { supportStyle: style };
    }
  }

  return {};
}

/**
 * Q6: "What area of life needs most attention right now?"
 */
async function extractLifeBalance(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  
  const categoryMap: Record<string, string> = {
    career: "career_work",
    health: "health_fitness",
    relationships: "relationships",
    personal_development: "personal_growth",
    finances: "finances",
  };

  if (selected) {
    const category = categoryMap[selected.toLowerCase().replace(/\s+/g, "_")] || "other";
    
    // Create a goal for this area
    return {
      goals: [{
        title: `Improve ${selected}`,
        category: category,
        priority: "high",
        confidence: 0.8,
      }],
    };
  }

  if (response && response.trim().length > 3) {
    return {
      goals: [{
        title: `Focus on ${response.trim()}`,
        category: "other",
        priority: "high",
        confidence: 0.7,
      }],
    };
  }

  return {};
}

/**
 * Q7: "What motivates you most?"
 */
async function extractMotivation(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  const values: string[] = [];

  if (selected) {
    values.push(selected.toLowerCase());
  }

  if (response && response.trim().length > 3) {
    values.push(response.trim());
  }

  return values.length > 0 ? { values } : {};
}

/**
 * Q8: "When overwhelmed, you typically..."
 */
async function extractStressResponse(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected || [];
  
  if (selected.length === 0 && !response) {
    return {};
  }

  const patterns: ExtractionResult["executionPatterns"] = [];

  const responseMap: Record<string, { pattern: string; impact: string }> = {
    avoid_tasks: { pattern: "avoidance", impact: "Responds to stress by avoiding tasks" },
    overplan: { pattern: "overthinking", impact: "Responds to stress by overplanning" },
    distract_myself: { pattern: "scattered_focus", impact: "Responds to stress with distraction" },
    work_harder: { pattern: "burnout", impact: "Responds to stress by pushing harder" },
    shut_down: { pattern: "burnout", impact: "Responds to overwhelm by shutting down" },
    start_something_new: { pattern: "scattered_focus", impact: "Responds to stress by starting new things" },
  };

  for (const choice of selected) {
    const key = choice.toLowerCase().replace(/\s+/g, "_");
    const mapped = responseMap[key];
    
    if (mapped) {
      patterns.push({
        pattern: mapped.pattern,
        trigger: "overwhelm",
        frequency: "frequent",
        severity: "medium",
        behavioralImpact: mapped.impact,
        confidence: 0.8,
      });
    }
  }

  if (response && response.trim().length > 3) {
    // Store as additional context but don't create pattern
  }

  return patterns.length > 0 ? { executionPatterns: patterns } : {};
}

/**
 * Q9: "How often do you want to reflect on your progress?"
 */
async function extractReflectionFrequency(response: string, responseData: any): Promise<ExtractionResult> {
  const selected = responseData?.selected;
  
  if (selected) {
    const frequencies: Record<string, string> = {
      daily: "daily",
      few_times_week: "few_times_week",
      weekly: "weekly",
      as_needed: "as_needed",
    };
    
    const frequency = frequencies[selected.toLowerCase().replace(/\s+/g, "_")];
    if (frequency) {
      return { reflectionFrequency: frequency };
    }
  }

  return {};
}

/**
 * Q10: "What's one thing you want to accomplish in the next 30 days?"
 */
async function extractInitialCommitment(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 3) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    messages: [
      {
        role: "system",
        content: `Extract commitment with timeframe. Return ONLY valid JSON:
{
  "description": "what they want to accomplish",
  "category": "health|work|relationships|personal|other",
  "timeframe": "30_days",
  "confidence": 0.8-0.95
}

This is a 30-day commitment. Be specific.`
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
          source: "onboarding",
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
          category: commitment.category,
          timeframe: commitment.timeframe,
          status: "active",
          source: "onboarding",
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
          source: "onboarding",
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

  // Update profile with extracted data
  const profileUpdates: any = {};
  
  if (extracted.supportStyle) {
    profileUpdates.support_style = extracted.supportStyle;
    profileUpdates.coaching_style = extracted.supportStyle; // Also set coaching_style
  }
  
  if (extracted.reflectionFrequency) {
    profileUpdates.reflection_frequency = extracted.reflectionFrequency;
  }

  if (extracted.dailyPriorities) {
    profileUpdates.daily_priorities = extracted.dailyPriorities;
  }

  if (extracted.obstacles) {
    profileUpdates.lifestyle_issues = extracted.obstacles;
  }

  if (extracted.values) {
    // Store values as a memory or in profile metadata
    await supabase.from("memories").insert({
      user_id: userId,
      content: `User values: ${extracted.values.join(", ")}`,
      memory_type: "preference",
      metadata: { source: "onboarding", values: extracted.values },
    });
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
    profileUpdates: Object.keys(profileUpdates).length,
  });
}
