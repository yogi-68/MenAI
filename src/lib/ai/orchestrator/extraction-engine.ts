/**
 * Extraction Engine — Conversational Intelligence
 * 
 * The core differentiator of Mettle:
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
import {
  archivePriorIdentitySignals,
  queueSuggestion,
  shouldSaveExplicit,
} from "@/lib/ai/memory-confidence";
import {
  adjustGoalConfidence,
  adjustProjectConfidence,
} from "@/lib/ai/extraction-confidence";
import { MEMORY_CONFIDENCE } from "@/lib/product/constants";
import { ensureMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

/**
 * Converts relative date strings ("87 days", "3 months", "2 weeks") to ISO date strings.
 * Falls back to Date.parse for explicit date strings.
 */
function parseRelativeDate(value: string): string | null {
  if (!value?.trim()) return null;
  const daysMatch = value.match(/(\d+)\s*days?/i);
  if (daysMatch) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(daysMatch[1], 10));
    return d.toISOString().split("T")[0];
  }
  const weeksMatch = value.match(/(\d+)\s*weeks?/i);
  if (weeksMatch) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(weeksMatch[1], 10) * 7);
    return d.toISOString().split("T")[0];
  }
  const monthsMatch = value.match(/(\d+)\s*months?/i);
  if (monthsMatch) {
    const d = new Date();
    d.setMonth(d.getMonth() + parseInt(monthsMatch[1], 10));
    return d.toISOString().split("T")[0];
  }
  const yearsMatch = value.match(/(\d+)\s*years?/i);
  if (yearsMatch) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + parseInt(yearsMatch[1], 10));
    return d.toISOString().split("T")[0];
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
}

const EMPTY_EXTRACTION: ExtractedLifeData = {
  goals: [],
  commitments: [],
  identitySignals: [],
  executionPatterns: [],
  relationships: [],
  habits: [],
  emotions: [],
  projects: [],
  opportunities: [],
  blockers: [],
  completedTasks: [],
};

/**
 * Extract structured life data from a user message.
 * Uses cheap LLM for fast classification.
 * Returns empty if nothing meaningful is found.
 * Includes confidence scoring — low-confidence items are filtered out.
 */
export async function extractLifeData(message: string): Promise<ExtractedLifeData> {
  const deadlineHit = extractDeadlineUpdate(message);
  if (deadlineHit) {
    console.log("[Extraction] Deadline update (fast path):", deadlineHit.goals[0]?.title);
    return deadlineHit;
  }

  const taskCompletionHit = extractTaskCompletion(message);
  if (taskCompletionHit) {
    console.log("[Extraction] Task completion (fast path):", taskCompletionHit.completedTasks[0]?.title);
    return taskCompletionHit;
  }

  const lifeAreaHit = extractLifeAreaInterest(message);
  if (lifeAreaHit) {
    console.log("[Extraction] Life area interest (fast path):", lifeAreaHit.identitySignals[0]?.description);
    return lifeAreaHit;
  }

  // Skip extraction for very short or casual messages
  if (shouldSkipExtraction(message)) {
    console.log("[Extraction] Skipped:", message.slice(0, 50));
    return EMPTY_EXTRACTION;
  }

  try {
    const raw = await classifyWithLLM(
      EXTRACTION_PROMPT,
      message
    );

    console.log("[Extraction] Raw LLM response:", raw.slice(0, 200));

    // Parse the JSON response
    const parsed = JSON.parse(raw);

    // Apply confidence filtering with lowered thresholds for better extraction
    // Thresholds lowered to capture more valid extractions
    const GOAL_THRESHOLD = 0.55;
    const COMMITMENT_THRESHOLD = 0.55;
    const IDENTITY_THRESHOLD = 0.55;
    const PROJECT_THRESHOLD = 0.50;
    const PATTERN_THRESHOLD = MEMORY_CONFIDENCE.patternMin;

    // Log pre-filtering counts
    console.log("[Extraction] Pre-filter counts:", {
      goals: Array.isArray(parsed.goals) ? parsed.goals.length : 0,
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments.length : 0,
      identitySignals: Array.isArray(parsed.identitySignals) ? parsed.identitySignals.length : 0,
      executionPatterns: Array.isArray(parsed.executionPatterns) ? parsed.executionPatterns.length : 0,
      projects: Array.isArray(parsed.projects) ? parsed.projects.length : 0,
    });

    const result = {
      goals: Array.isArray(parsed.goals)
        ? parsed.goals
            .map(sanitizeGoal)
            .map((g: ReturnType<typeof sanitizeGoal> & { tentative?: boolean }) =>
              adjustGoalConfidence(message, g)
            )
            .filter((g: { confidence?: number; title?: string }) => {
              const conf = g.confidence ?? 1;
              if (conf < GOAL_THRESHOLD) {
                console.log(`[Extraction] Filtered goal (conf=${conf.toFixed(2)}):`, g.title?.slice(0, 50));
              }
              return conf >= GOAL_THRESHOLD;
            })
        : [],
      commitments: Array.isArray(parsed.commitments)
        ? parsed.commitments.map(sanitizeCommitment).filter((c: { confidence?: number, description?: string }) => {
            const conf = c.confidence ?? 1;
            if (conf < COMMITMENT_THRESHOLD) {
              console.log(`[Extraction] Filtered commitment (conf=${conf.toFixed(2)}):`, c.description?.slice(0, 50));
            }
            return conf >= COMMITMENT_THRESHOLD;
          })
        : [],
      identitySignals: Array.isArray(parsed.identitySignals)
        ? parsed.identitySignals.map(sanitizeIdentitySignal).filter((i: { confidence?: number, type?: string }) => {
            const conf = i.confidence ?? 1;
            if (conf < IDENTITY_THRESHOLD) {
              console.log(`[Extraction] Filtered identity signal (conf=${conf.toFixed(2)}):`, i.type);
            }
            return conf >= IDENTITY_THRESHOLD;
          })
        : [],
      executionPatterns: Array.isArray(parsed.executionPatterns)
        ? parsed.executionPatterns.map(sanitizeExecutionPattern).filter((e: { confidence?: number, pattern?: string }) => {
            const conf = e.confidence ?? 1;
            if (conf < PATTERN_THRESHOLD) {
              console.log(`[Extraction] Filtered execution pattern (conf=${conf.toFixed(2)}):`, e.pattern);
            }
            return conf >= PATTERN_THRESHOLD;
          })
        : [],
      relationships: Array.isArray(parsed.relationships) ? parsed.relationships.map(sanitizeRelationship) : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits.map(sanitizeHabit) : [],
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions.map(sanitizeEmotion) : [],
      projects: Array.isArray(parsed.projects)
        ? parsed.projects
            .map(sanitizeProject)
            .map((p: ReturnType<typeof sanitizeProject> & { tentative?: boolean }) =>
              adjustProjectConfidence(message, p)
            )
            .filter((p: { confidence?: number; name?: string }) => {
              const conf = p.confidence ?? 1;
              if (conf < PROJECT_THRESHOLD) {
                console.log(`[Extraction] Filtered project (conf=${conf.toFixed(2)}):`, p.name?.slice(0, 50));
              }
              return conf >= PROJECT_THRESHOLD;
            })
        : [],
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map(sanitizeOpportunity).filter((o: { confidence?: number; title?: string }) => {
            const conf = o.confidence ?? 1;
            return conf >= PROJECT_THRESHOLD;
          })
        : [],
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers.filter((b: unknown) => typeof b === "string") : [],
      completedTasks: Array.isArray(parsed.completedTasks)
        ? parsed.completedTasks
            .map(sanitizeCompletedTask)
            .filter((t: { confidence?: number; title?: string }) => (t.confidence ?? 0) >= 0.75 && !!t.title)
        : [],
    };

    // Log extraction summary with details
    const extractionSummary = {
      goals: result.goals.length,
      commitments: result.commitments.length,
      identitySignals: result.identitySignals.length,
      executionPatterns: result.executionPatterns.length,
      projects: result.projects.length,
    };
    console.log("[Extraction] Post-filter summary:", extractionSummary);
    
    if (result.goals.length > 0) {
      console.log("[Extraction] Goals extracted:", result.goals.map((g: any) => ({
        title: g.title,
        confidence: g.confidence,
        category: g.category
      })));
    }
    if (result.commitments.length > 0) {
      console.log("[Extraction] Commitments extracted:", result.commitments.map((c: any) => ({
        description: c.description?.slice(0, 50),
        confidence: c.confidence
      })));
    }
    if (result.identitySignals.length > 0) {
      console.log("[Extraction] Identity signals extracted:", result.identitySignals.map((i: any) => ({
        type: i.type,
        confidence: i.confidence
      })));
    }

    return result;
  } catch (e) {
    console.error("[Extraction] Error:", e);
    return EMPTY_EXTRACTION;
  }
}

/**
 * Fast path: "Add a deadline to Build a business is 85 days"
 */
function extractDeadlineUpdate(message: string): ExtractedLifeData | null {
  const patterns = [
    /(?:add\s+a?\s*deadline\s+(?:to|for)\s+)(.+?)\s+(?:is\s+)?(\d+)\s*days?\b/i,
    /(?:deadline\s+(?:for|on)\s+)(.+?)\s+(?:is\s+)?(\d+)\s*days?\b/i,
    /(?:set\s+(?:the\s+)?deadline\s+(?:for|on|to)\s+)(.+?)\s+(?:to\s+)?(\d+)\s*days?\b/i,
  ];

  for (const re of patterns) {
    const match = message.match(re);
    if (!match) continue;
    const title = match[1].trim().replace(/\.$/, "");
    if (title.length < 3) continue;
    return {
      ...EMPTY_EXTRACTION,
      goals: [
        {
          title,
          category: "other",
          priority: "medium",
          targetDate: `${match[2]} days`,
          confidence: 0.95,
        },
      ],
    };
  }
  return null;
}

/**
 * Fast path: "I finished writing my success metric"
 */
function extractTaskCompletion(message: string): ExtractedLifeData | null {
  const patterns = [
    /\bi(?:'ve| have)?\s+(?:finished|completed|done with|knocked out|checked off|wrapped up)\s+(?:my\s+|the\s+)?(.+)/i,
    /\b(?:finished|completed|done with|wrapped up|checked off)\s+(?:my\s+|the\s+)?(.+)/i,
    /\bi\s+(?:did|finished|completed)\s+(?:my\s+|the\s+)?(.+)/i,
    /\bmark(?:ed)?\s+(.+?)\s+(?:as\s+)?done\b/i,
  ];

  for (const re of patterns) {
    const match = message.match(re);
    if (!match) continue;
    const title = match[1].trim().replace(/[.!?]+$/, "").slice(0, 200);
    if (title.length < 4) continue;
    if (/^(it|that|this|everything|all of it)$/i.test(title)) continue;
    return {
      ...EMPTY_EXTRACTION,
      completedTasks: [{ title, confidence: 0.9 }],
    };
  }
  return null;
}

/**
 * Fast path: "I am also into fitness" → life area memory (not a task suggestion).
 */
function extractLifeAreaInterest(message: string): ExtractedLifeData | null {
  const lower = message.trim().toLowerCase();
  const patterns: Array<{ re: RegExp; label: string; direction: string; category: ExtractedLifeData["goals"][0]["category"] }> = [
    { re: /\b(also |really )?(into|interested in|care about|focus on|working on|love)\s+(fitness|gym|workouts?|training)\b/, label: "Fitness", direction: "Physical health and fitness", category: "fitness" },
    { re: /\b(also |really )?(into|interested in|care about|focus on|working on)\s+(business|startups?|saas|building)\b/, label: "Business building", direction: "Building a business", category: "startup" },
    { re: /\b(also |really )?(into|interested in|care about|focus on|working on)\s+(investing|finance|money|wealth|income)\b/, label: "Wealth and income", direction: "Financial freedom and wealth", category: "financial" },
    { re: /\b(also |really )?(into|interested in|care about|focus on|studying)\s+(learning|study|exams?|upsc|coding)\b/, label: "Learning", direction: "Learning and skill building", category: "learning" },
    { re: /\b(also |really )?(into|interested in|care about)\s+(health|nutrition|eating well)\b/, label: "Health", direction: "Health and nutrition", category: "health" },
  ];

  for (const p of patterns) {
    if (!p.re.test(lower)) continue;
    return {
      ...EMPTY_EXTRACTION,
      goals: [
        {
          title: p.label,
          category: p.category,
          priority: "medium",
          confidence: 0.88,
          description: `Mentioned in chat: ${message.trim().slice(0, 120)}`,
        },
      ],
      identitySignals: [
        {
          type: "other",
          description: p.label,
          longTermDirection: p.direction,
          confidence: 0.9,
        },
      ],
    };
  }
  return null;
}

/**
 * Detect named-entity signals: capitalized names, numbers, goal/deadline keywords.
 * Used to allow extraction on short messages that contain real content.
 */
function hasNamedEntitySignals(message: string): boolean {
  return (
    /[A-Z][a-z]{2,}/.test(message) ||
    /\d+/.test(message) ||
    /\b(goal|deadline|milestone|client|business|revenue|launch|kg|km|lbs|lb|%|startup|project|weight|fitness|run|gym|sales|hire|raise|fund)\b/i.test(message)
  );
}

/**
 * Determine if a message is too short or casual to extract from.
 * Saves ~30% of extraction LLM calls for acknowledgements and short replies.
 */
function shouldSkipExtraction(message: string): boolean {
  const lower = message.trim().toLowerCase();

  // Too short — hard minimum
  if (lower.length < 10) return true;

  // Casual patterns — exact matches
  const casualPatterns = [
    /^(hi|hey|hello|yo|sup|hola|good morning|good night|gm|gn)[\s!.]*$/,
    /^(thanks|thank you|thx|ty|cool|ok|okay|got it|makes sense|yeah|yep|nah|nope)[\s!.]*$/,
    /^(how are you|what's up|whats up)[\s?!.]*$/,
  ];
  if (casualPatterns.some((p) => p.test(lower))) return true;

  // Medium-length acknowledgement — skip unless named entities present
  if (lower.length < 60 && !hasNamedEntitySignals(message)) return true;

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
): Promise<boolean> {
  const tasks: PromiseLike<unknown>[] = [];
  let wroteData = false;

  async function findGoalByTitleHint(titleHint: string) {
    const { data: goals } = await supabase
      .from("goals")
      .select("id, title, target_date")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(24);

    if (!goals?.length) return null;
    const hint = titleHint.toLowerCase().trim();
    if (!hint) return null;

    const exact = goals.find((g) => g.title.toLowerCase() === hint);
    if (exact) return exact;

    const contains = goals.find(
      (g) =>
        g.title.toLowerCase().includes(hint) || hint.includes(g.title.toLowerCase())
    );
    if (contains) return contains;

    const hintWords = hint.split(/\s+/).filter((w) => w.length > 3);
    return (
      goals.find((g) => {
        const titleWords = g.title.toLowerCase().split(/\s+/);
        return hintWords.some((w) => titleWords.some((tw: string) => tw.includes(w) || w.includes(tw)));
      }) ?? null
    );
  }

  // Direction (goals): explicit statements save immediately; low confidence → suggestion queue
  if (data.goals.length > 0) {
    for (const goal of data.goals) {
      const conf = goal.confidence ?? 0.8;
      if (shouldSaveExplicit(conf)) {
        tasks.push(
          (async () => {
            const existing = await findGoalByTitleHint(goal.title);
            if (existing) {
              if (goal.targetDate) {
                const isoDate = parseRelativeDate(goal.targetDate);
                if (isoDate && existing.target_date !== isoDate) {
                  await supabase
                    .from("goals")
                    .update({ target_date: isoDate })
                    .eq("id", existing.id);
                  wroteData = true;
                  Promise.resolve(
                    supabase.from("goal_milestones").delete().eq("goal_id", existing.id)
                  ).then(() =>
                    ensureMilestonesForGoal(supabase, userId, existing.id).catch(() => {})
                  ).catch(() => {});
                  invalidateUserCache(userId, "deadline extracted");
                }
              }
              return;
            }
            const insertDate = goal.targetDate ? parseRelativeDate(goal.targetDate) : null;
            await supabase.from("goals").insert({
              user_id: userId,
              title: goal.title,
              description: goal.description || null,
              category: goal.category,
              priority: goal.priority,
              target_date: insertDate || null,
              source: "chat_extraction",
            });
            wroteData = true;
          })()
        );
      } else {
        const g = goal as typeof goal & { tentative?: boolean };
        tasks.push(
          queueSuggestion(supabase, {
            userId,
            type: "direction",
            title: g.title,
            payload: {
              description: goal.description,
              category: goal.category,
              priority: goal.priority,
              tentative: g.tentative ?? g.title.endsWith("?"),
            },
            confidence: conf,
            conversationId,
          })
        );
      }
    }
  }

  // Initiatives: always queue for user confirmation (never auto-create)
  if (data.projects.length > 0) {
    for (const project of data.projects) {
      const title = project.name.trim();
      if (!title) continue;
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 30);

      const adjusted = project as typeof project & { tentative?: boolean };

      tasks.push(
        queueSuggestion(supabase, {
          userId,
          type: "initiative",
          title,
          payload: {
            description: project.context,
            targetDate: defaultDeadline.toISOString().split("T")[0],
            lifeArea: inferLifeAreaFromProject(project),
            tentative: adjusted.tentative ?? title.endsWith("?"),
            status: project.status,
          },
          confidence: project.confidence ?? 0.85,
          conversationId,
        })
      );
    }
  }

  // Opportunities: queue unless very explicit dated event
  if (data.opportunities.length > 0) {
    for (const opp of data.opportunities) {
      const conf = opp.confidence ?? 0.85;
      const autoSave =
        conf >= MEMORY_CONFIDENCE.opportunityAutoSave && !!opp.dueDate;

      if (autoSave) {
        tasks.push(
          (async () => {
            const { data: existing } = await supabase
              .from("opportunities")
              .select("id")
              .eq("user_id", userId)
              .ilike("title", opp.title)
              .limit(1);
            if (existing?.length) return;
            await supabase.from("opportunities").insert({
              user_id: userId,
              title: opp.title,
              description: opp.description || null,
              due_date: opp.dueDate || null,
              urgency: opp.urgency,
              life_area: opp.lifeArea || "personal",
              status: "active",
            });
          })()
        );
      } else {
        tasks.push(
          queueSuggestion(supabase, {
            userId,
            type: "opportunity",
            title: opp.title,
            payload: {
              description: opp.description,
              dueDate: opp.dueDate,
              urgency: opp.urgency,
              lifeArea: opp.lifeArea,
            },
            confidence: conf,
            conversationId,
          })
        );
      }
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

  // Identity: archive prior active signals when direction shifts, then insert new
  if (data.identitySignals.length > 0) {
    for (const signal of data.identitySignals) {
      tasks.push(
        (async () => {
          if (signal.confidence >= MEMORY_CONFIDENCE.explicitSave) {
            await archivePriorIdentitySignals(supabase, userId);
          }
          await supabase.from("identity_signals").insert({
            user_id: userId,
            type: signal.type,
            description: signal.description,
            long_term_direction: signal.longTermDirection,
            confidence: signal.confidence,
            status: "active",
            source: "chat_extraction",
          });
        })()
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

  // Task completions from chat (match today's pending tasks by title)
  if (data.completedTasks.length > 0) {
    for (const completion of data.completedTasks) {
      if ((completion.confidence ?? 0) < 0.75) continue;
      tasks.push(
        (async () => {
          const today = new Date().toISOString().split("T")[0];
          const { data: pendingTasks } = await supabase
            .from("tasks")
            .select("id, title, status")
            .eq("user_id", userId)
            .eq("due_date", today)
            .in("status", ["pending", "in_progress"]);

          if (!pendingTasks?.length) return;

          const hint = completion.title.toLowerCase().trim();
          const match =
            pendingTasks.find((t) => t.title.toLowerCase() === hint) ??
            pendingTasks.find(
              (t) =>
                t.title.toLowerCase().includes(hint) || hint.includes(t.title.toLowerCase())
            ) ??
            pendingTasks.find((t) => {
              const words = hint.split(/\s+/).filter((w) => w.length > 3);
              const titleLower = t.title.toLowerCase();
              return words.some((w) => titleLower.includes(w));
            });

          if (!match || match.status === "completed") return;

          const now = new Date().toISOString();
          await supabase
            .from("tasks")
            .update({
              status: "completed",
              completed_at: now,
              last_completed_at: now,
            })
            .eq("id", match.id)
            .eq("user_id", userId);
          wroteData = true;
          console.log("[Extraction] Task completed via chat:", match.title);
        })()
      );
    }
  }

  await Promise.allSettled(tasks);

  if (hasExtractedData(data)) {
    invalidateUserCache(userId, "extraction persisted");
  }

  return wroteData || hasExtractedData(data);
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
    data.opportunities.length > 0 ||
    data.blockers.length > 0 ||
    data.completedTasks.length > 0
  );
}

// ===== Sanitization helpers =====

function sanitizeCompletedTask(task: Record<string, unknown>) {
  return {
    title: String(task.title || "").slice(0, 200),
    confidence: typeof task.confidence === "number" ? task.confidence : 0.85,
  } as ExtractedLifeData["completedTasks"][number];
}

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

function sanitizeOpportunity(opp: Record<string, unknown>) {
  const validUrgency = ["low", "medium", "high", "critical"];
  const validAreas = ["career", "business", "finance", "health", "learning", "relationships", "personal"];
  return {
    title: String(opp.title || "").slice(0, 200),
    description: opp.description ? String(opp.description).slice(0, 400) : undefined,
    dueDate: opp.dueDate ? String(opp.dueDate) : undefined,
    urgency: validUrgency.includes(String(opp.urgency)) ? (String(opp.urgency) as ExtractedLifeData["opportunities"][number]["urgency"]) : "medium",
    lifeArea: validAreas.includes(String(opp.lifeArea)) ? String(opp.lifeArea) : "personal",
    confidence: typeof opp.confidence === "number" ? opp.confidence : 0.85,
  } as ExtractedLifeData["opportunities"][number];
}

function inferLifeAreaFromProject(project: ExtractedLifeData["projects"][number]): string {
  const text = `${project.name} ${project.context || ""}`.toLowerCase();
  if (/saas|startup|business|revenue|client|mvp/.test(text)) return "business";
  if (/job|career|interview|resume/.test(text)) return "career";
  if (/fitness|weight|workout|calisthenics|fat|lose \d|kg|10kg/.test(text)) return "health";
  if (/learn|study|course|upsc|exam|prelims/.test(text)) return "learning";
  if (/youtube|channel|creator|content/.test(text)) return "personal";
  return "personal";
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
