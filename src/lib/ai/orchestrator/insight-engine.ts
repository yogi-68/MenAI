/**
 * Emotional Insight Engine — Pattern Recognition Across Conversations
 * 
 * STATUS: NOT CURRENTLY USED IN PRODUCTION
 * This module is defined but not imported by any active code path.
 * It was designed for advanced emotional pattern detection.
 * 
 * This engine is designed to detect:
 * - Recurring emotional themes (loneliness, exhaustion, anxiety)
 * - Emotional triggers (work → stress, weekends → loneliness)
 * - Emotional arcs (mood declining/improving over time)
 * - Behavioral patterns (isolation cycles, avoidance)
 * 
 * If you want to use this, import and call from the orchestrator.
 * Otherwise, this can be safely removed if not needed.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export interface EmotionalPattern {
  theme: string;
  frequency: number;
  recentOccurrences: string[];
  insight: string;
  severity: "low" | "medium" | "high";
}

export interface EmotionalTrigger {
  trigger: string;
  effect: string;
  confidence: number;
}

/**
 * Analyze user's emotional patterns from memories and conversations
 */
export async function analyzeEmotionalPatterns(
  userId: string,
  timeframeHours: number = 168 // Default: last 7 days
): Promise<EmotionalPattern[]> {
  try {
    const supabase = await createServiceRoleClient();
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - timeframeHours);

    // Get recent memories and conversations
    const { data: memories } = await supabase
      .from("memories")
      .select("content, created_at, memory_type")
      .eq("user_id", userId)
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (!memories || memories.length === 0) return [];

    const patterns: EmotionalPattern[] = [];

    // Define emotional themes to track
    const themes = {
      loneliness: ["lonely", "alone", "isolated", "disconnected", "no friends", "nobody", "by myself"],
      exhaustion: ["exhausted", "tired", "drained", "worn out", "no energy", "can't do", "give up"],
      anxiety: ["anxious", "anxiety", "panic", "worry", "racing", "overwhelm", "stressed", "nervous"],
      depression: ["hopeless", "numb", "empty", "no point", "depressed", "sad", "can't feel"],
      relationshipStruggles: ["relationship", "partner", "family", "fight", "conflict", "misunderstood"],
      workStress: ["work", "job", "boss", "deadline", "pressure", "career", "school"],
      selfWorth: ["worthless", "failure", "not enough", "useless", "can't do anything", "broken"],
    };

    // Count occurrences of each theme
    for (const [themeName, keywords] of Object.entries(themes)) {
      const occurrences: string[] = [];

      for (const memory of memories) {
        const content = memory.content.toLowerCase();
        if (keywords.some((keyword) => content.includes(keyword))) {
          occurrences.push(memory.content);
        }
      }

      if (occurrences.length >= 2) {
        // At least 2 occurrences to be considered a pattern
        const severity = occurrences.length >= 5 ? "high" : occurrences.length >= 3 ? "medium" : "low";
        const insight = generateInsight(themeName, occurrences.length, timeframeHours);

        patterns.push({
          theme: themeName,
          frequency: occurrences.length,
          recentOccurrences: occurrences.slice(0, 3),
          insight,
          severity,
        });
      }
    }

    // Sort by frequency (most common first)
    patterns.sort((a, b) => b.frequency - a.frequency);

    return patterns.slice(0, 3); // Return top 3 patterns
  } catch (e) {
    console.error("Pattern analysis error:", e);
    return [];
  }
}

/**
 * Generate natural language insight from pattern
 */
function generateInsight(theme: string, frequency: number, timeframeHours: number): string {
  const timeframe = timeframeHours <= 48 ? "the last couple days" : "this past week";

  const insights: Record<string, string[]> = {
    loneliness: [
      `You've mentioned feeling isolated ${frequency} times in ${timeframe}. That sense of disconnection seems to be a recurring weight.`,
      `Loneliness has come up ${frequency} times recently. It sounds like missing emotional connection has been particularly heavy for you.`,
      `You've brought up feeling alone ${frequency} times in ${timeframe}. That kind of isolation can wear a person down quietly.`,
    ],
    exhaustion: [
      `You've mentioned exhaustion ${frequency} times in ${timeframe}. It sounds like you've been running on empty for a while now.`,
      `Feeling drained has come up ${frequency} times recently. That kind of tiredness often means you've been carrying too much for too long.`,
      `You've talked about being tired ${frequency} times in ${timeframe}. It sounds like your mind and body are both asking for rest.`,
    ],
    anxiety: [
      `Anxiety has appeared ${frequency} times in ${timeframe}. Your mind seems to have been racing quite a bit lately.`,
      `You've mentioned anxious feelings ${frequency} times recently. It sounds like your nervous system has been on high alert.`,
      `Anxiety has come up ${frequency} times in ${timeframe}. That constant sense of overwhelm must be exhausting.`,
    ],
    depression: [
      `You've expressed feelings of hopelessness ${frequency} times in ${timeframe}. That heaviness seems to be persistent.`,
      `Numbness and emptiness have come up ${frequency} times recently. It sounds like you've been feeling pretty disconnected from yourself.`,
      `You've mentioned feeling low ${frequency} times in ${timeframe}. That kind of persistent sadness deserves attention.`,
    ],
    relationshipStruggles: [
      `Relationship challenges have come up ${frequency} times in ${timeframe}. It sounds like connection with others has been complicated lately.`,
      `You've mentioned relationship struggles ${frequency} times recently. Those kinds of conflicts can add a lot of emotional weight.`,
      `Relationships have been a topic ${frequency} times in ${timeframe}. It sounds like there's been some pain in your connections with others.`,
    ],
    workStress: [
      `Work stress has appeared ${frequency} times in ${timeframe}. It sounds like your job has been grinding you down.`,
      `You've mentioned work pressure ${frequency} times recently. That constant demand must be exhausting.`,
      `Work has come up ${frequency} times in ${timeframe} as a source of stress. It sounds like it's taking a toll on your wellbeing.`,
    ],
    selfWorth: [
      `You've expressed self-doubt ${frequency} times in ${timeframe}. It sounds like you've been hard on yourself lately.`,
      `Questions about your worth have come up ${frequency} times recently. That kind of self-criticism can be really heavy.`,
      `You've mentioned feeling inadequate ${frequency} times in ${timeframe}. It sounds like you're carrying a lot of shame or self-judgment.`,
    ],
  };

  const themeInsights = insights[theme] || [`This theme has appeared ${frequency} times in ${timeframe}.`];
  return themeInsights[Math.floor(Math.random() * themeInsights.length)];
}

/**
 * Identify emotional triggers from conversation history
 * Example: "work" mentions → increased anxiety intensity
 */
export async function identifyEmotionalTriggers(
  userId: string
): Promise<EmotionalTrigger[]> {
  try {
    const supabase = await createServiceRoleClient();

    // Get recent conversations with emotion data
    const { data: messages } = await supabase
      .from("messages")
      .select("content, emotion_data, created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .not("emotion_data", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!messages || messages.length === 0) return [];

    const triggers: EmotionalTrigger[] = [];

    // Simple correlation analysis
    const triggerWords = ["work", "family", "weekend", "alone", "friend", "night", "morning"];

    for (const triggerWord of triggerWords) {
      const withTrigger: number[] = [];
      const withoutTrigger: number[] = [];

      for (const msg of messages) {
        const content = msg.content.toLowerCase();
        const intensity = msg.emotion_data?.intensity || 0;

        if (content.includes(triggerWord)) {
          withTrigger.push(intensity);
        } else {
          withoutTrigger.push(intensity);
        }
      }

      // Calculate average intensity with and without trigger
      if (withTrigger.length >= 3 && withoutTrigger.length >= 3) {
        const avgWith = withTrigger.reduce((a, b) => a + b, 0) / withTrigger.length;
        const avgWithout = withoutTrigger.reduce((a, b) => a + b, 0) / withoutTrigger.length;
        const difference = avgWith - avgWithout;

        // If trigger increases negative emotion by 2+ points, it's significant
        if (difference >= 2) {
          triggers.push({
            trigger: triggerWord,
            effect: "increases distress",
            confidence: Math.min(difference / 5, 1), // 0-1 scale
          });
        }
      }
    }

    return triggers.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  } catch (e) {
    console.error("Trigger identification error:", e);
    return [];
  }
}

/**
 * Format patterns into a natural narrative for the prompt
 */
export function formatPatternsForPrompt(patterns: EmotionalPattern[]): string {
  if (patterns.length === 0) return "";

  const insights = patterns.map((p) => p.insight);

  return `## Emotional Patterns You've Noticed

${insights.join("\n\n")}

These aren't just statistics — they're real emotional threads in this person's life. Reference them naturally when relevant to show you remember and understand their ongoing struggles.`;
}
