/**
 * Crisis Detection System
 * Multi-layer safety system for detecting mental health emergencies
 */

// High-risk keywords and phrases (multi-language support)
const CRISIS_PATTERNS = {
  suicidal_ideation: [
    "kill myself", "end my life", "want to die", "better off dead",
    "no reason to live", "can't go on", "suicide", "suicidal",
    "end it all", "take my own life", "not worth living",
    "planning to die", "goodbye forever", "final goodbye",
    "nobody would miss me", "world is better without me",
  ],
  self_harm: [
    "cut myself", "cutting myself", "hurt myself", "hurting myself",
    "self harm", "self-harm", "burn myself", "starve myself",
    "hitting myself", "punishing myself physically",
  ],
  abuse: [
    "being abused", "someone is hurting me", "being beaten",
    "sexually abused", "domestic violence", "forced me",
    "threatened to kill", "afraid for my life",
  ],
  severe_distress: [
    "panic attack", "can't breathe", "having a breakdown",
    "losing my mind", "going crazy", "can't take it anymore",
    "completely hopeless", "no way out",
  ],
};

export type CrisisLevel = "none" | "low" | "medium" | "high" | "critical";

export interface CrisisDetectionResult {
  level: CrisisLevel;
  categories: string[];
  matchedPatterns: string[];
  confidence: number;
  requiresEscalation: boolean;
  emergencyResources: EmergencyResource[];
}

export interface EmergencyResource {
  name: string;
  phone: string;
  text?: string;
  url?: string;
  available: string;
}

const EMERGENCY_RESOURCES: EmergencyResource[] = [
  {
    name: "National Suicide Prevention Lifeline",
    phone: "988",
    text: "Text HOME to 741741",
    url: "https://988lifeline.org",
    available: "24/7",
  },
  {
    name: "Crisis Text Line",
    phone: "",
    text: "Text HELLO to 741741",
    url: "https://www.crisistextline.org",
    available: "24/7",
  },
  {
    name: "SAMHSA National Helpline",
    phone: "1-800-662-4357",
    url: "https://www.samhsa.gov/find-help/national-helpline",
    available: "24/7, 365 days",
  },
  {
    name: "International Association for Suicide Prevention",
    phone: "",
    url: "https://www.iasp.info/resources/Crisis_Centres/",
    available: "Directory of crisis centers worldwide",
  },
];

/**
 * Rule-based crisis detection (fast, first pass)
 */
export function detectCrisisKeywords(message: string): {
  categories: string[];
  matchedPatterns: string[];
} {
  const lowerMessage = message.toLowerCase();
  const categories: string[] = [];
  const matchedPatterns: string[] = [];

  for (const [category, patterns] of Object.entries(CRISIS_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        if (!categories.includes(category)) {
          categories.push(category);
        }
        matchedPatterns.push(pattern);
      }
    }
  }

  return { categories, matchedPatterns };
}

/**
 * Determine crisis level from detected categories
 */
export function assessCrisisLevel(categories: string[]): CrisisLevel {
  if (categories.includes("suicidal_ideation")) return "critical";
  if (categories.includes("self_harm")) return "high";
  if (categories.includes("abuse")) return "high";
  if (categories.includes("severe_distress")) return "medium";
  return "none";
}

/**
 * Full crisis detection pipeline
 */
export function detectCrisis(message: string): CrisisDetectionResult {
  const { categories, matchedPatterns } = detectCrisisKeywords(message);
  const level = assessCrisisLevel(categories);

  const confidence =
    level === "critical" ? 0.95 :
    level === "high" ? 0.85 :
    level === "medium" ? 0.7 :
    level === "low" ? 0.5 : 0;

  return {
    level,
    categories,
    matchedPatterns,
    confidence,
    requiresEscalation: level === "critical" || level === "high",
    emergencyResources: level !== "none" ? EMERGENCY_RESOURCES : [],
  };
}

/**
 * Generate a crisis response message
 */
export function getCrisisResponseMessage(result: CrisisDetectionResult): string {
  if (result.level === "critical") {
    return `I hear you, and I'm really glad you're reaching out. What you're going through sounds incredibly painful, and I want you to know that you matter deeply.

**Please reach out to someone who can help right now:**

🆘 **988 Suicide & Crisis Lifeline** — Call or text **988** (available 24/7)
💬 **Crisis Text Line** — Text **HELLO** to **741741**

You don't have to face this alone. A trained counselor is ready to talk with you right now, confidentially and for free.

I'm here for you, and I care about your safety. Would you like me to stay with you while you reach out to one of these resources?`;
  }

  if (result.level === "high") {
    return `I can sense that you're going through something really difficult right now, and I'm concerned about your safety. You deserve support.

**If you're in immediate danger, please contact:**

🆘 **988 Suicide & Crisis Lifeline** — Call or text **988**
💬 **Crisis Text Line** — Text **HELLO** to **741741**
📞 **Emergency Services** — Call **911**

These services are free, confidential, and available 24/7.

I'm here to listen, and I want to help you through this. Can you tell me more about what's happening?`;
  }

  if (result.level === "medium") {
    return `It sounds like you're going through a really tough time. I want you to know that what you're feeling is valid, and you don't have to carry this alone.

If things ever feel overwhelming, these resources are always available:
• **988 Lifeline** — Call or text **988** anytime
• **Crisis Text Line** — Text **HELLO** to **741741**

I'm here to help. Would you like to try a calming exercise together, or would you prefer to talk more about what's going on?`;
  }

  return "";
}
