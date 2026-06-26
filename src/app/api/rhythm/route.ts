/**
 * AI Daily Rhythm API — /api/rhythm
 *
 * Creates a daily rhythm loop that drives retention:
 *
 * Morning (before 12pm):
 *   - Planning mode
 *   - Focus setup
 *   - Momentum initialization
 *
 * Afternoon (12pm - 6pm):
 *   - Execution nudges
 *   - Task renegotiation
 *   - Adjustment signals
 *
 * Night (after 6pm):
 *   - Reflection prompts
 *   - Emotional decompression
 *   - Synthesis trigger
 *
 * GET /api/rhythm → Returns the current rhythm context for the user
 * POST /api/rhythm/synthesize → Triggers deep synthesis (admin/cron only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCognitiveState, formatCognitiveStateForDashboard } from "@/lib/ai/orchestrator/cognition-engine";
import { needsSynthesisOnLogin, runDeepSynthesis } from "@/lib/ai/orchestrator/synthesis-worker";
import { getCurrentPhase } from "@/lib/plans/rhythm-phase";

export const runtime = "nodejs";

type RhythmPhase = "morning" | "afternoon" | "night";

interface RhythmContext {
  phase: RhythmPhase;
  greeting: string;
  focus_prompt: string;
  suggested_action: string;
  cognitive_summary: {
    direction: string;
    momentum: string;
    observation: string | null;
    weakness_hint: string | null;
  };
  tasks_due_today: number;
  maturity_level: string;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if we need a fresh synthesis on first login of day
    const needsSync = await needsSynthesisOnLogin(user.id);
    if (needsSync) {
      // Fire-and-forget: trigger synthesis in background
      runDeepSynthesis(user.id, "first_login_of_day").catch(() => {});
    }

    // Build cognitive state (fast path — cached)
    const cogState = await buildCognitiveState(user.id);
    const dashboardState = formatCognitiveStateForDashboard(cogState);
    const phase = getCurrentPhase();

    // Count tasks due today
    const today = new Date().toISOString().split("T")[0];
    const [{ count }, goalsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("due_date", today)
        .in("status", ["pending", "in_progress"]),
      supabase
        .from("goals")
        .select("target_date")
        .eq("user_id", user.id)
        .eq("goal_kind", "execution")
        .eq("status", "active"),
    ]);

    const hasDeadline = (goalsRes.data ?? []).some((g) => Boolean(g.target_date));

    const rhythm: RhythmContext = {
      phase,
      greeting: _buildPhaseGreeting(phase, cogState.maturity_level, cogState.momentum_state),
      focus_prompt: _buildFocusPrompt(phase, cogState),
      suggested_action: _buildSuggestedAction(phase, cogState, hasDeadline),
      cognitive_summary: {
        direction: dashboardState.direction_text || "",
        momentum: "",
        observation: null,
        weakness_hint: null,
      },
      tasks_due_today: count || 0,
      maturity_level: cogState.maturity_level,
    };

    return NextResponse.json(rhythm);
  } catch (error) {
    console.error("[Rhythm API] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ===== PHASE-AWARE CONTENT =====

function _buildPhaseGreeting(
  phase: RhythmPhase,
  maturity: string,
  momentum: string,
): string {
  if (maturity === "new") {
    const greetings: Record<RhythmPhase, string> = {
      morning: "Good morning. Let's set up your day.",
      afternoon: "Afternoon check-in. How's execution going?",
      night: "Evening. Time to reflect on what happened today.",
    };
    return greetings[phase];
  }

  // Mature user — context-aware greetings
  if (phase === "morning") {
    if (momentum === "surging") return "Morning. You're in a strong rhythm — let's keep it going.";
    if (momentum === "declining") return "Morning. Yesterday was heavy. Let's set a lighter pace today.";
    return "Morning. Here's what matters today.";
  }

  if (phase === "afternoon") {
    if (momentum === "surging") return "You're deep in execution. Stay focused.";
    if (momentum === "stalling") return "Afternoon checkpoint. What's blocking progress?";
    return "Midday. How's your focus holding up?";
  }

  // Night
  if (momentum === "surging") return "Strong day. Let's capture what worked.";
  if (momentum === "declining") return "Take a breath. Tomorrow is a fresh start.";
  return "End of day. What's worth remembering?";
}

function _buildFocusPrompt(
  phase: RhythmPhase,
  state: import("@/lib/ai/orchestrator/cognition-engine").CognitiveState,
): string {
  if (state.maturity_level === "new") {
    return "Share what's on your mind. MenAI learns from every conversation.";
  }

  if (phase === "morning") {
    if (state.active_goals.length > 0) {
      return `Your top priority: ${state.active_goals[0].title}. What's the first step today?`;
    }
    return "What's the one thing that would make today count?";
  }

  if (phase === "afternoon") {
    if (state.task_pressure_level === "critical" || state.task_pressure_level === "high") {
      return "You have a lot on your plate. What can be removed or postponed?";
    }
    if (state.detected_weaknesses.some(w => w.type === "distraction")) {
      return "Stay single-threaded. What's the ONE task you're finishing right now?";
    }
    return "What did you accomplish so far? What's left?";
  }

  // Night
  if (state.emotional_load === "heavy" || state.emotional_load === "overwhelming") {
    return "How are you feeling right now? Not about tasks — about you.";
  }
  return "What's one thing you learned about yourself today?";
}

function _buildSuggestedAction(
  phase: RhythmPhase,
  state: import("@/lib/ai/orchestrator/cognition-engine").CognitiveState,
  hasDeadline = true,
): string {
  if (phase === "morning" && (state.maturity_level === "new" || !hasDeadline)) {
    return "Set a deadline on your goal and MenAI will generate your plan.";
  }

  if (phase === "morning") {
    if (state.task_pressure_level === "critical") return "Cut 3 tasks. Start with only the most important one.";
    if (state.detected_weaknesses.some(w => w.type === "sleep_deprivation")) return "Lighter day. Protect your energy.";
    return "Pick your top 3 tasks and time-block them.";
  }

  if (phase === "afternoon") {
    if (state.momentum_state === "stalling" || state.momentum_state === "declining") {
      return "Complete one small thing right now to rebuild momentum.";
    }
    return "Review progress. Adjust the remaining plan if needed.";
  }

  // Night
  if (state.detected_weaknesses.some(w => w.type === "burnout")) {
    return "No screens after 10pm. Tomorrow needs you rested.";
  }
  return "Reflect on what worked today. Note one thing to improve tomorrow.";
}
