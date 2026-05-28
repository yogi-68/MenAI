/**
 * Weakness Detector — Continuous Behavioral Intelligence
 *
 * This is MenAI's moat.
 *
 * Continuously detects:
 *   - overthinking
 *   - burnout
 *   - distraction
 *   - inconsistency
 *   - perfectionism
 *   - emotional crashes
 *   - avoidance
 *   - lack of sleep
 *   - overcommitting
 *
 * Then: everything adapts around that.
 *
 * This runs in two modes:
 *   1. INLINE: Quick signal scan on every chat message (< 5ms)
 *   2. DEEP: Full analysis during nightly synthesis
 */

import type { CognitiveState, DetectedWeakness } from "./cognition-engine";

// ===== SIGNAL TYPES =====

export interface WeaknessSignal {
  type: DetectedWeakness["type"];
  confidence: number;   // 0-1
  source: "chat" | "behavior" | "pattern" | "memory";
  raw_text?: string;    // The text that triggered detection
}

// ===== INLINE DETECTION (runs on every chat message) =====

/**
 * Fast signal scan on a user message.
 * Returns detected weakness signals WITHOUT touching the DB.
 * Takes < 5ms.
 */
export function scanMessageForWeakness(message: string): WeaknessSignal[] {
  const signals: WeaknessSignal[] = [];
  const lower = message.toLowerCase();

  // Burnout signals
  const burnoutPatterns = [
    /i('m| am) (so |really |very )?(tired|exhausted|burned out|burnt out|drained)/,
    /can't (keep|do|handle|take) (this|it) anymore/,
    /i (need|have) to (stop|rest|take a break)/,
    /everything feels (heavy|hard|impossible|overwhelming)/,
    /i('m| am) (running on|barely) (fumes|empty)/,
  ];
  for (const pattern of burnoutPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "burnout", confidence: 0.8, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Sleep deprivation signals
  const sleepPatterns = [
    /stayed (up|awake) (till|until|to) [2-6](am| am)/,
    /can't sleep|couldn't sleep|insomnia/,
    /slept (only |just )?[2-4] hours/,
    /been up (all night|since [2-5]am)/,
    /pulled an all[- ]?nighter/,
  ];
  for (const pattern of sleepPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "sleep_deprivation", confidence: 0.9, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Overthinking signals
  const overthinkingPatterns = [
    /i('ve| have) been (thinking|going back and forth|analyzing|planning) (too much|all day|for hours)/,
    /can't (decide|make up my mind|choose|stop thinking)/,
    /maybe i should|what if i|should i even/,
    /i keep going (back and forth|in circles)/,
    /analysis paralysis/,
  ];
  for (const pattern of overthinkingPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "overthinking", confidence: 0.7, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Avoidance signals
  const avoidancePatterns = [
    /i('ve| have) been (avoiding|putting off|procrastinating|delaying)/,
    /i (don't|can't) (want to|bring myself to)/,
    /i keep (skipping|ignoring|postponing)/,
    /i'll do it (tomorrow|later|next week)/,
  ];
  for (const pattern of avoidancePatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "avoidance", confidence: 0.75, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Perfectionism signals
  const perfectionismPatterns = [
    /it('s| is) not (good|ready|perfect) enough/,
    /i (need|want) (it|this) to be perfect/,
    /i can't (ship|publish|launch|send) (it|this) (yet|until)/,
    /one more (thing|tweak|change|revision)/,
    /i keep (polishing|refining|editing|tweaking)/,
  ];
  for (const pattern of perfectionismPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "perfectionism", confidence: 0.7, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Emotional crash signals
  const emotionalPatterns = [
    /i (feel|felt) (so |really )?(worthless|hopeless|useless|empty|numb)/,
    /nothing (matters|works|is working)/,
    /what('s| is) the point/,
    /i('m| am) (failing|a failure|not good enough)/,
    /i (want|need) to (give up|quit|stop)/,
  ];
  for (const pattern of emotionalPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "emotional_crash", confidence: 0.85, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Distraction signals
  const distractionPatterns = [
    /i (got|keep getting) distracted/,
    /i can't (focus|concentrate)/,
    /i (spent|wasted) (hours|all day) on (social media|youtube|tiktok|reddit|scrolling)/,
    /i keep (switching|jumping) between/,
  ];
  for (const pattern of distractionPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "distraction", confidence: 0.75, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  // Overcommitting signals
  const overcommittingPatterns = [
    /i (said yes|took on|committed) to (too much|everything|another)/,
    /i have (so much|too much|way too much) (to do|on my plate)/,
    /i('m| am) (stretched|spread) too thin/,
    /i can't say no/,
  ];
  for (const pattern of overcommittingPatterns) {
    if (pattern.test(lower)) {
      signals.push({ type: "overcommitting", confidence: 0.7, source: "chat", raw_text: message.slice(0, 100) });
      break;
    }
  }

  return signals;
}

// ===== SIGNAL AGGREGATION =====

/**
 * Merge inline signals into the cognitive state's weakness list.
 * Called after scanMessageForWeakness() to update the running state.
 */
export function mergeWeaknessSignals(
  existingWeaknesses: DetectedWeakness[],
  newSignals: WeaknessSignal[],
): DetectedWeakness[] {
  const merged = [...existingWeaknesses];

  for (const signal of newSignals) {
    const existing = merged.find(w => w.type === signal.type);
    if (existing) {
      // Escalate severity if seen again
      if (existing.severity === "low") existing.severity = "medium";
      else if (existing.severity === "medium") existing.severity = "high";
      // Update evidence
      if (signal.raw_text) {
        existing.evidence = signal.raw_text;
      }
    } else {
      // New weakness detected
      merged.push({
        type: signal.type,
        severity: signal.confidence >= 0.8 ? "medium" : "low",
        evidence: signal.raw_text || `Detected from ${signal.source}`,
        adaptation_hint: _getAdaptationHintForSignal(signal.type),
      });
    }
  }

  return merged;
}

// ===== ADAPTATION RESPONSES =====

/**
 * Get the appropriate system adaptation for a detected weakness.
 * Used by the orchestrator to modify AI behavior.
 */
export function getWeaknessAdaptations(weaknesses: DetectedWeakness[]): string[] {
  const adaptations: string[] = [];

  for (const w of weaknesses) {
    if (w.severity === "high" || w.severity === "medium") {
      switch (w.type) {
        case "burnout":
          adaptations.push("BURNOUT DETECTED: Suggest lighter tasks. Don't push execution. Validate their need to rest.");
          break;
        case "sleep_deprivation":
          adaptations.push("SLEEP DEPRIVED: Recommend lighter workload tomorrow. Prioritize recovery over productivity.");
          break;
        case "overthinking":
          adaptations.push("OVERTHINKING: Cut through analysis. Give ONE clear next action. Don't offer multiple options.");
          break;
        case "avoidance":
          adaptations.push("AVOIDANCE PATTERN: Gently name what they're avoiding. Suggest starting with just 5 minutes.");
          break;
        case "perfectionism":
          adaptations.push("PERFECTIONISM: Push to ship at 80%. Remind them that done beats perfect.");
          break;
        case "emotional_crash":
          adaptations.push("EMOTIONAL DISTRESS: Lead with empathy. Don't push tasks or execution. Acknowledge feelings first.");
          break;
        case "distraction":
          adaptations.push("DISTRACTED: Suggest single-threading. One task, one focus block. No multitasking.");
          break;
        case "overcommitting":
          adaptations.push("OVERCOMMITTED: Help them cut scope. What can be removed or delayed? Don't add more.");
          break;
        case "inconsistency":
          adaptations.push("INCONSISTENCY: Focus on one small daily habit. Streaks over volume.");
          break;
      }
    }
  }

  return adaptations;
}

function _getAdaptationHintForSignal(type: DetectedWeakness["type"]): string {
  const hints: Record<string, string> = {
    overthinking: "Stop planning. Pick one thing and start it right now.",
    burnout: "You need rest, not another task. Recovery is productive.",
    distraction: "Close everything else. One task, 60 minutes, no switching.",
    inconsistency: "Pick the easiest commitment. Do it for 7 days. Nothing else matters.",
    perfectionism: "Ship at 80%. Your users need it more than you need it perfect.",
    emotional_crash: "Feel what you're feeling. You don't need to fix everything today.",
    avoidance: "Name the thing you're avoiding. Then give it just 5 minutes.",
    sleep_deprivation: "Sleep is your highest-leverage activity right now. Everything else can wait.",
    overcommitting: "Say no to 3 things today. Your plate is fuller than you think.",
  };
  return hints[type] || "Adapt your approach based on what your body and mind are telling you.";
}
