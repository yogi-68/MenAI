/**
 * Onboarding Memory Extraction Service - Updated for Domain-Agnostic Questions
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
  obstacles?: string[];
  supportStyle?: string;
  reflectionFrequency?: string;
  dailyPriorities?: string[];
}

// Question mapping to extraction logic for NEW questions
const QUESTION_EXTRACTORS: Record<string, (response: string, responseData: any) => Promise<ExtractionResult>> = {
  Q1: extractPersonalGoals,        // What's most important to you right now in your life?
  Q2: extractFutureVision,         // Where do you see yourself in a year?
  Q3: extractObstacles,            // What obstacles are you facing?
  Q4: extractDailyPriorities,      // What do you want to focus on daily?
  Q5: extractSupportStyle,         // How do you prefer guidance?
  Q6: extractLifeBalance,          // What area needs most attention?
  Q7: extractMotivation,           // What motivates you most?
  Q8: extractStressResponse,       // When overwhelmed, you typically...
  Q9: extractReflectionFrequency,  // How often do you want to reflect?
  Q10: extractInitialCommitment,   // 30-day accomplishment goal
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
 * Q1: "What's most important to you right now in your life?"
 */
async function extractPersonalGoals(response: string, _data: any): Promise<ExtractionResult> {
  if (!response || response.trim().length < 3) {
    return {};
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
    model: "gpt-4o-mini",
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
      pattern: null,
      impact: null
    },
    health: { 
      obstacle: "health",
      pattern: null,
      impact: null
    },
    career_uncertainty: { 
      obstacle: "career_uncertainty", 
      pattern: "avoidance", 
      impact: "Career uncertainty creates paralysis" 
    },
    financial_concerns: { 
      obstacle: "financial_concerns",
      pattern: null,
      impact: null
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
      model: "gpt-4o-mini",
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
    model: "gpt-4o-mini",
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
          signal_type: signal.type,
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
