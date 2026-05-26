/**
 * Style Validator — Response Quality Enforcement
 * 
 * Validates AI responses to ensure they meet MenAI quality standards:
 * - NOT generic advice
 * - NOT robotic templates
 * - Personalized and contextual
 * - Strategic thinking depth
 * 
 * Prevents responses like:
 * "Research market, build MVP, identify audience..." (generic startup advice)
 * "I'm here to help" (robotic empathy)
 */

import type { LifeContext, ContextRichness } from "./types";

export interface StyleValidationResult {
  valid: boolean;
  violations: StyleViolation[];
  score: number; // 0-100
  shouldRegenerate: boolean;
  feedback?: string;
}

export interface StyleViolation {
  type: "generic_advice" | "fake_personalization" | "insufficient_depth" | "robotic_tone" | "hallucinated_context";
  severity: "low" | "medium" | "high";
  description: string;
  example?: string;
}

// ===== Generic Phrase Detection =====

const BANNED_GENERIC_PHRASES: Array<{ pattern: RegExp; severity: "low" | "medium" | "high"; description: string }> = [
  {
    pattern: /research.*market.*build.*mvp.*identify.*audience/i,
    severity: "high",
    description: "Generic startup advice sequence without personalization"
  },
  {
    pattern: /work on your saas|work on your startup|work on your product/i,
    severity: "high",
    description: "Assumed SaaS/startup goal without user confirmation"
  },
  {
    pattern: /send.*outreach.*emails|do.*outreach/i,
    severity: "high",
    description: "Assumed outreach activity without user confirmation"
  },
  // NEW: Additional generic founder advice patterns
  {
    pattern: /research (your )?competitors?|competitive analysis/i,
    severity: "high",
    description: "Generic 'research competitors' advice without user context"
  },
  {
    pattern: /validate (your |the )?idea|idea validation/i,
    severity: "high",
    description: "Generic 'validate your idea' advice without user context"
  },
  {
    pattern: /build (an? |your )?mvp|minimum viable product/i,
    severity: "high",
    description: "Generic 'build an MVP' advice without user context"
  },
  {
    pattern: /define (your )?target (user|audience|customer)/i,
    severity: "high",
    description: "Generic 'define target user' advice without user context"
  },
  {
    pattern: /talk to (potential )?customers?|customer interviews?/i,
    severity: "high",
    description: "Generic 'talk to customers' advice without user context"
  },
  {
    pattern: /find product[- ]market fit|pmf/i,
    severity: "high",
    description: "Generic product-market fit advice without user context"
  },
  {
    pattern: /start with a landing page|build a landing page/i,
    severity: "high",
    description: "Generic landing page advice without user confirmation"
  },
  // Existing patterns
  {
    pattern: /i'm here to help|i'm here for you/i,
    severity: "medium",
    description: "Robotic empathy phrase"
  },
  {
    pattern: /let me know if|feel free to/i,
    severity: "low",
    description: "Passive assistant language"
  },
  {
    pattern: /your feelings are valid/i,
    severity: "medium",
    description: "Generic therapy response"
  },
  {
    pattern: /that sounds difficult|that must be hard/i,
    severity: "low",
    description: "Generic empathy without depth"
  },
  {
    pattern: /deep work.*on.*landing page|finish.*landing page/i,
    severity: "high",
    description: "Assumed landing page work without user mention"
  },
  {
    pattern: /morning workout routine|workout session/i,
    severity: "high",
    description: "Assumed workout routine without user mention"
  },
];

const ROBOTIC_TEMPLATES: RegExp[] = [
  /^(sure|okay|of course|absolutely)[,!.]\s+(i can help|let me help|here's what)/i,
  /based on (what you've told me|our conversation|what you said)/i,
  /as (an ai|your ai|a language model)/i,
];

// ===== Strategic Depth Indicators =====

const STRATEGIC_INDICATORS: string[] = [
  "why",
  "because",
  "pattern",
  "trajectory",
  "direction",
  "momentum",
  "leverage",
  "positioning",
  "underlying",
  "really",
  "actually",
];

const SHALLOW_INDICATORS: string[] = [
  "just do",
  "simply",
  "easy steps",
  "quick tips",
  "here's how",
];

// ===== Planning Validation =====

const PLANNING_KEYWORDS: string[] = [
  "plan",
  "schedule",
  "today",
  "tomorrow",
  "this week",
  "prioritize",
  "focus on",
];

const HALLUCINATED_TASKS: RegExp[] = [
  /\d+\.\s*(work on|build|finish|complete|send).*mvp/i,
  /\d+\.\s*send.*outreach.*email/i,
  /\d+\.\s*deep work.*session/i,
  /\d+\.\s*morning.*workout/i,
  /\d+\.\s*review.*metrics/i,
  /\d+\.\s*call.*investors?/i,
];

/**
 * Main validation function
 * Checks response against MenAI quality standards
 */
export function validateResponseStyle(
  response: string,
  context: {
    lifeContext?: LifeContext | null;
    contextRichness: ContextRichness;
    userMessage: string;
  }
): StyleValidationResult {
  const violations: StyleViolation[] = [];
  let score = 100;

  // 1. Check for banned generic phrases
  for (const banned of BANNED_GENERIC_PHRASES) {
    if (banned.pattern.test(response)) {
      violations.push({
        type: "generic_advice",
        severity: banned.severity,
        description: banned.description,
        example: response.match(banned.pattern)?.[0],
      });
      score -= banned.severity === "high" ? 30 : banned.severity === "medium" ? 15 : 5;
    }
  }

  // 2. Check for robotic templates
  for (const template of ROBOTIC_TEMPLATES) {
    if (template.test(response)) {
      violations.push({
        type: "robotic_tone",
        severity: "medium",
        description: "Using robotic assistant template language",
      });
      score -= 15;
    }
  }

  // 3. Validate planning responses don't hallucinate
  const isPlanningResponse = PLANNING_KEYWORDS.some(keyword =>
    response.toLowerCase().includes(keyword)
  );

  if (isPlanningResponse && context.contextRichness.level === "LOW") {
    // Check if response contains specific tasks
    const containsSpecificTasks = /\d+\.\s*[A-Z]/.test(response); // Numbered list
    
    if (containsSpecificTasks) {
      // Check if tasks are hallucinated
      for (const hallucinated of HALLUCINATED_TASKS) {
        if (hallucinated.test(response)) {
          violations.push({
            type: "hallucinated_context",
            severity: "high",
            description: "Generated specific tasks without knowing user's actual goals",
            example: response.match(hallucinated)?.[0],
          });
          score -= 40; // Major violation
        }
      }
      
      // Even if no obvious hallucination, generating detailed plans with LOW context is suspicious
      if (violations.filter(v => v.type === "hallucinated_context").length === 0) {
        violations.push({
          type: "fake_personalization",
          severity: "high",
          description: "Generated detailed plan with insufficient context about user's goals",
        });
        score -= 35;
      }
    }
  }

  // 4. Check strategic depth
  const hasStrategicDepth = STRATEGIC_INDICATORS.some(indicator =>
    response.toLowerCase().includes(indicator)
  );
  
  const hasShallowIndicators = SHALLOW_INDICATORS.some(indicator =>
    response.toLowerCase().includes(indicator)
  );

  if (!hasStrategicDepth && response.length > 200 && !isPlanningResponse) {
    violations.push({
      type: "insufficient_depth",
      severity: "low",
      description: "Response lacks strategic thinking depth",
    });
    score -= 10;
  }

  if (hasShallowIndicators) {
    score -= 5;
  }

  // 5. Check for personalization when context exists
  if (context.contextRichness.level === "HIGH" && context.lifeContext) {
    const hasGoalReference = context.lifeContext.activeGoals.some(goal =>
      response.toLowerCase().includes(goal.title.toLowerCase())
    );
    
    const hasCommitmentReference = context.lifeContext.activeCommitments.some(commitment =>
      response.toLowerCase().includes(commitment.description.toLowerCase().slice(0, 30))
    );

    // With high context, response should use specific user data
    if (!hasGoalReference && !hasCommitmentReference && isPlanningResponse) {
      violations.push({
        type: "insufficient_depth",
        severity: "medium",
        description: "High context available but response doesn't reference user's specific goals/commitments",
      });
      score -= 20;
    }
  }

  // 6. Final scoring
  score = Math.max(0, Math.min(100, score));
  
  const valid = score >= 70;
  const shouldRegenerate = score < 60 || violations.some(v => v.severity === "high");

  const feedback = shouldRegenerate ? buildRegenerationFeedback(violations, context) : undefined;

  return {
    valid,
    violations,
    score,
    shouldRegenerate,
    feedback,
  };
}

/**
 * Build feedback for LLM regeneration
 */
function buildRegenerationFeedback(
  violations: StyleViolation[],
  context: {
    lifeContext?: LifeContext | null;
    contextRichness: ContextRichness;
    userMessage: string;
  }
): string {
  const parts: string[] = [
    "Your previous response failed quality validation. Please regenerate with these corrections:",
  ];

  const highSeverityViolations = violations.filter(v => v.severity === "high");
  
  if (highSeverityViolations.length > 0) {
    parts.push("\nCRITICAL ISSUES:");
    for (const v of highSeverityViolations) {
      parts.push(`- ${v.description}`);
      if (v.example) {
        parts.push(`  Found: "${v.example}"`);
      }
    }
  }

  if (violations.some(v => v.type === "hallucinated_context")) {
    parts.push("\n⚠️ DO NOT invent tasks, goals, or plans that the user hasn't mentioned.");
    parts.push("If you don't have enough context, ASK what they're working on.");
  }

  if (violations.some(v => v.type === "generic_advice")) {
    parts.push("\n⚠️ Your response was too generic. Be SPECIFIC to this user's situation.");
  }

  if (violations.some(v => v.type === "robotic_tone")) {
    parts.push("\n⚠️ Avoid robotic assistant language. Sound like a real strategic mentor.");
  }

  if (context.contextRichness.level === "HIGH" && context.lifeContext) {
    parts.push("\n✅ You have RICH context. Use it:");
    if (context.lifeContext.activeGoals.length > 0) {
      parts.push(`- Reference their actual goals: ${context.lifeContext.activeGoals.map(g => g.title).join(", ")}`);
    }
    if (context.lifeContext.activeCommitments.length > 0) {
      parts.push(`- Reference their commitments`);
    }
  }

  if (context.contextRichness.level === "LOW") {
    parts.push("\n✅ Context is LOW. Your response should:");
    parts.push("- Ask what they're working on");
    parts.push("- NOT generate detailed plans");
    parts.push("- Focus on gathering information");
  }

  return parts.join("\n");
}

/**
 * Quick check if a response is obviously generic
 * Used for fast pre-filtering
 */
export function isObviouslyGeneric(response: string): boolean {
  const genericPatterns = [
    /research.*market.*build.*mvp/i,
    /step 1.*step 2.*step 3/i,
    /here are (some|the) (steps|things)/i,
  ];

  return genericPatterns.some(p => p.test(response));
}

/**
 * Check if response references user's actual context
 */
export function hasPersonalization(
  response: string,
  lifeContext?: LifeContext | null
): boolean {
  if (!lifeContext) return false;

  // Check if any goals are referenced
  const hasGoalReference = lifeContext.activeGoals.some(goal =>
    response.toLowerCase().includes(goal.title.toLowerCase())
  );

  // Check if any commitments are referenced
  const hasCommitmentReference = lifeContext.activeCommitments.some(commitment =>
    response.toLowerCase().includes(commitment.description.toLowerCase().slice(0, 20))
  );

  return hasGoalReference || hasCommitmentReference;
}
