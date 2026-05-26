/**
 * Extraction Engine — Conversational Intelligence
 * 
 * The core differentiator of MenAI:
 * Automatically extracts structured life data from natural conversations.
 * 
 * User says: "I really want to stop eating processed foods and get healthier."
 * Engine extracts: Goal(healthier eating), Commitment(stop processed foods), Category(nutrition)
 * 
 * This runs on every user message (non-blocking, parallel to response generation).
 */

import { classifyWithLLM } from "./router";
import { EXTRACTION_PROMPT } from "@/lib/ai/prompts";
import type { ExtractedLifeData } from "./types";

const EMPTY_EXTRACTION: ExtractedLifeData = {
  goals: [],
  commitments: [],
  identitySignals: [],
  executionPatterns: [],
  relationships: [],
  habits: [],
  emotions: [],
  projects: [],
  blockers: [],
};

/**
 * Extract structured life data from a user message.
 * Uses cheap LLM for fast classification.
 * Returns empty if nothing meaningful is found.
 * Includes confidence scoring — low-confidence items are filtered out.
 */
export async function extractLifeData(message: string): Promise<ExtractedLifeData> {
  // Skip extraction for very short or casual messages
  if (shouldSkipExtraction(message)) {
    return EMPTY_EXTRACTION;
  }

  try {
    const raw = await classifyWithLLM(
      EXTRACTION_PROMPT,
      message
    );

    // Parse the JSON response
    const parsed = JSON.parse(raw);

    // Apply confidence filtering — only keep items above threshold
    const CONFIDENCE_THRESHOLD = 0.7;

    return {
      goals: Array.isArray(parsed.goals)
        ? parsed.goals.map(sanitizeGoal).filter((g: { confidence?: number }) => (g.confidence ?? 1) >= CONFIDENCE_THRESHOLD)
        : [],
      commitments: Array.isArray(parsed.commitments)
        ? parsed.commitments.map(sanitizeCommitment).filter((c: { confidence?: number }) => (c.confidence ?? 1) >= CONFIDENCE_THRESHOLD)
        : [],
      identitySignals: Array.isArray(parsed.identitySignals)
        ? parsed.identitySignals.map(sanitizeIdentitySignal).filter((i: { confidence?: number }) => (i.confidence ?? 1) >= CONFIDENCE_THRESHOLD)
        : [],
      executionPatterns: Array.isArray(parsed.executionPatterns)
        ? parsed.executionPatterns.map(sanitizeExecutionPattern).filter((e: { confidence?: number }) => (e.confidence ?? 1) >= CONFIDENCE_THRESHOLD)
        : [],
      relationships: Array.isArray(parsed.relationships) ? parsed.relationships.map(sanitizeRelationship) : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits.map(sanitizeHabit) : [],
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions.map(sanitizeEmotion) : [],
      projects: Array.isArray(parsed.projects)
        ? parsed.projects.map(sanitizeProject).filter((p: { confidence?: number }) => (p.confidence ?? 1) >= CONFIDENCE_THRESHOLD)
        : [],
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers.filter((b: unknown) => typeof b === "string") : [],
    };
  } catch (e) {
    console.error("Extraction engine error:", e);
    return EMPTY_EXTRACTION;
  }
}

/**
 * Determine if a message is too short or casual to extract from
 */
function shouldSkipExtraction(message: string): boolean {
  const lower = message.trim().toLowerCase();

  // Too short (lowered from 15 to 10 to catch "I need to build a SaaS" etc.)
  if (lower.length < 10) return true;

  // Casual patterns
  const casualPatterns = [
    /^(hi|hey|hello|yo|sup|hola|good morning|good night|gm|gn)[\s!.]*$/,
    /^(thanks|thank you|thx|ty|cool|ok|okay|got it|makes sense|yeah|yep|nah|nope)[\s!.]*$/,
    /^(how are you|what's up|whats up)[\s?!.]*$/,
  ];
  if (casualPatterns.some((p) => p.test(lower))) return true;

  return false;
}

/**
 * Persist extracted data to the database.
 * Called after extraction completes (non-blocking).
 */
export async function persistExtractedData(
  userId: string,
  data: ExtractedLifeData,
  conversationId: string,
  supabase: ReturnType<typeof import("@/lib/supabase/server").createServiceRoleClient> extends Promise<infer T> ? T : never
): Promise<void> {
  const tasks: PromiseLike<unknown>[] = [];

  // Persist goals
  if (data.goals.length > 0) {
    for (const goal of data.goals) {
      tasks.push(
        supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          description: goal.description || null,
          category: goal.category,
          priority: goal.priority,
          target_date: goal.targetDate || null,
          extracted_from: conversationId,
        }).then(() => {})
      );
    }
  }

  // Persist commitments
  if (data.commitments.length > 0) {
    for (const commitment of data.commitments) {
      tasks.push(
        supabase.from("commitments").insert({
          user_id: userId,
          description: commitment.description,
          category: commitment.category,
          extracted_from: conversationId,
        }).then(() => {})
      );
    }
  }

  // Persist identity signals
  if (data.identitySignals.length > 0) {
    for (const signal of data.identitySignals) {
      tasks.push(
        supabase.from("identity_signals").insert({
          user_id: userId,
          type: signal.type,
          description: signal.description,
          long_term_direction: signal.longTermDirection,
          confidence: signal.confidence,
          extracted_from: conversationId,
        }).then(() => {})
      );
    }
  }

  // Persist execution patterns (upsert by pattern type)
  if (data.executionPatterns.length > 0) {
    for (const pattern of data.executionPatterns) {
      // Check if pattern already exists
      const { data: existing } = await supabase
        .from("execution_patterns")
        .select("id, occurrences")
        .eq("user_id", userId)
        .eq("pattern", pattern.pattern)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing pattern
        tasks.push(
          supabase.from("execution_patterns").update({
            trigger: pattern.trigger || null,
            frequency: pattern.frequency,
            severity: pattern.severity,
            behavioral_impact: pattern.behavioralImpact,
            confidence: pattern.confidence,
            last_detected: new Date().toISOString(),
            occurrences: (existing[0].occurrences || 0) + 1,
          }).eq("id", existing[0].id).then(() => {})
        );
      } else {
        tasks.push(
          supabase.from("execution_patterns").insert({
            user_id: userId,
            pattern: pattern.pattern,
            trigger: pattern.trigger || null,
            frequency: pattern.frequency,
            severity: pattern.severity,
            behavioral_impact: pattern.behavioralImpact,
            confidence: pattern.confidence,
          }).then(() => {})
        );
      }
    }
  }

  // Persist relationships (upsert by name)
  if (data.relationships.length > 0) {
    for (const rel of data.relationships) {
      // Check if relationship already exists
      const { data: existing } = await supabase
        .from("relationships")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", rel.name)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update last_mentioned_at and notes
        tasks.push(
          supabase.from("relationships").update({
            last_mentioned_at: new Date().toISOString(),
            notes: rel.context || undefined,
          }).eq("id", existing[0].id).then(() => {})
        );
      } else {
        tasks.push(
          supabase.from("relationships").insert({
            user_id: userId,
            name: rel.name,
            role: rel.role,
            notes: rel.context || null,
            last_mentioned_at: new Date().toISOString(),
          }).then(() => {})
        );
      }
    }
  }

  await Promise.allSettled(tasks);
}

/**
 * Check if extracted data has any meaningful content
 */
export function hasExtractedData(data: ExtractedLifeData): boolean {
  return (
    data.goals.length > 0 ||
    data.commitments.length > 0 ||
    data.identitySignals.length > 0 ||
    data.executionPatterns.length > 0 ||
    data.relationships.length > 0 ||
    data.projects.length > 0 ||
    data.blockers.length > 0
  );
}

// ===== Sanitization helpers =====

function sanitizeGoal(goal: Record<string, unknown>) {
  const validCategories = ["startup", "fitness", "financial", "relationship", "learning", "identity", "health", "career", "other"];
  const validPriorities = ["low", "medium", "high", "critical"];
  return {
    title: String(goal.title || "").slice(0, 200),
    category: validCategories.includes(String(goal.category)) ? String(goal.category) : "other",
    priority: validPriorities.includes(String(goal.priority)) ? String(goal.priority) : "medium",
    description: goal.description ? String(goal.description).slice(0, 500) : undefined,
    targetDate: goal.targetDate ? String(goal.targetDate) : undefined,
    confidence: typeof goal.confidence === "number" ? goal.confidence : 0.8,
  } as ExtractedLifeData["goals"][number] & { confidence: number };
}

function sanitizeCommitment(commitment: Record<string, unknown>) {
  const validCategories = ["health", "work", "relationships", "personal", "other"];
  return {
    description: String(commitment.description || "").slice(0, 300),
    category: validCategories.includes(String(commitment.category)) ? String(commitment.category) : "other",
    timeframe: commitment.timeframe ? String(commitment.timeframe) : undefined,
    confidence: typeof commitment.confidence === "number" ? commitment.confidence : 0.8,
  } as ExtractedLifeData["commitments"][number] & { confidence: number };
}

function sanitizeRelationship(rel: Record<string, unknown>) {
  const validRoles = ["partner", "parent", "friend", "mentor", "coworker", "other"];
  return {
    name: String(rel.name || "").slice(0, 100),
    role: validRoles.includes(String(rel.role)) ? String(rel.role) : "other",
    context: rel.context ? String(rel.context).slice(0, 300) : undefined,
  } as ExtractedLifeData["relationships"][number];
}

function sanitizeHabit(habit: Record<string, unknown>) {
  const validTypes = ["sleep", "workout", "nutrition", "deep_work", "reading", "learning", "social_media", "other"];
  const validStatuses = ["positive", "negative", "neutral"];
  return {
    name: String(habit.name || "").slice(0, 100),
    type: validTypes.includes(String(habit.type)) ? String(habit.type) : "other",
    status: validStatuses.includes(String(habit.status)) ? String(habit.status) : "neutral",
  } as ExtractedLifeData["habits"][number];
}

function sanitizeEmotion(emotion: Record<string, unknown>) {
  return {
    emotion: String(emotion.emotion || "neutral").slice(0, 50),
    intensity: Math.min(10, Math.max(1, Number(emotion.intensity) || 5)),
    trigger: emotion.trigger ? String(emotion.trigger).slice(0, 200) : undefined,
  } as ExtractedLifeData["emotions"][number];
}

function sanitizeProject(project: Record<string, unknown>) {
  const validStatuses = ["active", "stuck", "completed", "idea"];
  return {
    name: String(project.name || "").slice(0, 100),
    status: validStatuses.includes(String(project.status)) ? String(project.status) : "active",
    context: project.context ? String(project.context).slice(0, 300) : undefined,
    confidence: typeof project.confidence === "number" ? project.confidence : 0.8,
  } as ExtractedLifeData["projects"][number] & { confidence: number };
}

function sanitizeIdentitySignal(signal: Record<string, unknown>) {
  const validTypes = ["founder", "creator", "self-discipline", "leadership", "other"];
  return {
    type: validTypes.includes(String(signal.type)) ? String(signal.type) : "other",
    description: String(signal.description || "").slice(0, 300),
    longTermDirection: String(signal.longTermDirection || "").slice(0, 200),
    confidence: typeof signal.confidence === "number" ? signal.confidence : 0.8,
    extractedFrom: signal.extractedFrom ? String(signal.extractedFrom) : undefined,
  } as ExtractedLifeData["identitySignals"][number];
}

function sanitizeExecutionPattern(pattern: Record<string, unknown>) {
  const validPatterns = ["burnout", "procrastination", "avoidance", "perfectionism", "scattered_focus", "inconsistency", "overthinking"];
  const validFrequencies = ["rare", "occasional", "frequent", "constant"];
  const validSeverities = ["low", "medium", "high"];
  return {
    pattern: validPatterns.includes(String(pattern.pattern)) ? String(pattern.pattern) : "procrastination",
    trigger: pattern.trigger ? String(pattern.trigger).slice(0, 200) : undefined,
    frequency: validFrequencies.includes(String(pattern.frequency)) ? String(pattern.frequency) : "occasional",
    severity: validSeverities.includes(String(pattern.severity)) ? String(pattern.severity) : "medium",
    behavioralImpact: String(pattern.behavioralImpact || "").slice(0, 300),
    confidence: typeof pattern.confidence === "number" ? pattern.confidence : 0.8,
    extractedFrom: pattern.extractedFrom ? String(pattern.extractedFrom) : undefined,
  } as ExtractedLifeData["executionPatterns"][number];
}
