/**
 * Daily Plan Generation API
 * 
 * Generates adaptive daily execution plan based on:
 * - Active goals
 * - Pending tasks
 * - Execution patterns
 * - Current momentum
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if plan already exists for today to prevent unlimited generation
    const { data: existingPlanCheck } = await supabase
      .from("daily_plans")
      .select("id, plan_content")
      .eq("user_id", user.id)
      .eq("plan_date", today)
      .maybeSingle();

    if (existingPlanCheck) {
      return NextResponse.json({
        success: true,
        plan: existingPlanCheck.plan_content,
        message: "Plan already exists for today. Returning existing plan."
      });
    }

    // Get user context
    const [goalsRes, tasksRes, patternsRes] = await Promise.allSettled([
      supabase
        .from("goals")
        .select("title, category, priority")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("priority", { ascending: false })
        .limit(5),
      supabase
        .from("tasks")
        .select("title, status")
        .eq("user_id", user.id)
        .in("status", ["pending", "in_progress"])
        .limit(10),
      supabase
        .from("execution_patterns")
        .select("pattern, severity, behavioral_impact")
        .eq("user_id", user.id)
        .order("severity", { ascending: false })
        .limit(3),
    ]);

    const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) : [];
    const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) : [];
    const patterns = patternsRes.status === "fulfilled" ? (patternsRes.value.data || []) : [];

    // Generate focus areas
    const focusAreas: string[] = [];
    if (goals.length > 0) {
      goals.slice(0, 3).forEach(g => {
        focusAreas.push(g.title);
      });
    }

    // Generate adaptive tasks based on patterns
    const adaptiveTasks: Array<{ title: string; reason: string; priority: string }> = [];
    
    if (patterns.length > 0 && patterns[0].pattern) {
      const pattern = patterns[0].pattern;
      
      if (pattern === "overthinking") {
        adaptiveTasks.push({
          title: "Ship one component before 2pm",
          reason: "Execution before perfection",
          priority: "high"
        });
      } else if (pattern === "scattered_focus") {
        adaptiveTasks.push({
          title: "Complete one workflow end-to-end",
          reason: "Depth over breadth",
          priority: "high"
        });
      } else if (pattern === "perfectionism") {
        adaptiveTasks.push({
          title: "Release something incomplete but functional",
          reason: "Progress over polish",
          priority: "high"
        });
      }
    }

    // Add goal-based tasks
    if (goals.length > 0) {
      goals.slice(0, 2).forEach(goal => {
        adaptiveTasks.push({
          title: `Make progress on: ${goal.title}`,
          reason: "Active goal",
          priority: goal.priority
        });
      });
    }

    // Generate AI notes
    let aiNotes = "";
    if (patterns.length > 0) {
      const pattern = patterns[0];
      aiNotes = `Pattern detected: ${pattern.pattern}. ${pattern.behavioral_impact}`;
    } else if (focusAreas.length > 0) {
      aiNotes = `Focus remains on ${focusAreas[0]}.`;
    } else {
      aiNotes = "No clear focus detected yet.";
    }

    // Create or update daily plan
    const planContent = {
      focusAreas,
      tasks: adaptiveTasks,
      aiNotes,
    };

    // Insert the plan (we already checked it doesn't exist above)
    await supabase
      .from("daily_plans")
      .insert({
        user_id: user.id,
        plan_date: today,
        plan_content: planContent,
      });

    // Create task entries
    if (adaptiveTasks.length > 0) {
      const taskInserts = adaptiveTasks.map(task => ({
        user_id: user.id,
        title: task.title,
        status: "pending",
        due_date: today,
      }));

      await supabase.from("tasks").insert(taskInserts);
    }

    return NextResponse.json({
      success: true,
      plan: planContent,
    });
  } catch (error) {
    console.error("Plan generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate plan" },
      { status: 500 }
    );
  }
}
