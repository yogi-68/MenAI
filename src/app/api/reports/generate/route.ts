/**
 * Report Generation API
 * Generates AI-powered consistency reports with downloadable PDF
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ReportData {
  reportType: "daily" | "weekly" | "monthly";
  startDate: string;
  endDate: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ReportData = await request.json();
    const { reportType, startDate, endDate } = body;

    // Fetch user data for the report period
    const [tasksRes, goalsRes, commitmentsRes, profileRes] = await Promise.allSettled([
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .gte("due_date", startDate)
        .lte("due_date", endDate),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("commitments")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single()
    ]);

    const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) : [];
    const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) : [];
    const commitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data || []) : [];
    const profile = profileRes.status === "fulfilled" ? profileRes.value.data : null;

    // Calculate consistency metrics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.status === "completed").length;
    const completionPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate daily consistency (how many days had at least one completed task)
    const daysWithCompletedTasks = new Set(
      tasks
        .filter((t: any) => t.status === "completed" && t.completed_at)
        .map((t: any) => new Date(t.completed_at).toISOString().split('T')[0])
    ).size;

    const totalDays = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    
    const dailyConsistency = totalDays > 0 ? (daysWithCompletedTasks / totalDays) * 100 : 0;

    // Calculate commitment follow-through
    const avgCommitmentScore = commitments.length > 0
      ? commitments.reduce((sum: number, c: any) => sum + (c.consistency_score || 0), 0) / commitments.length
      : 0;

    // Generate AI summary using GPT-4
    const aiPrompt = `You are a personal performance analyst. Generate a concise, insightful ${reportType} performance report for ${profile?.full_name || "the user"}.

**Data:**
- Total Tasks: ${totalTasks}
- Completed Tasks: ${completedTasks} (${completionPercentage.toFixed(1)}%)
- Daily Consistency: ${dailyConsistency.toFixed(1)}% (active ${daysWithCompletedTasks} out of ${totalDays} days)
- Active Goals: ${goals.filter((g: any) => g.status === "active").length}
- Commitment Follow-Through: ${avgCommitmentScore.toFixed(1)}%

**Top Goals:**
${goals.slice(0, 3).map((g: any) => `- ${g.title} (${g.category}, ${g.priority} priority)`).join('\n')}

**Recent Tasks:**
${tasks.slice(-5).map((t: any) => `- [${t.status}] ${t.title}`).join('\n')}

Write a 3-paragraph analysis covering:
1. **Performance Summary**: Overall execution and consistency
2. **Strengths**: What went well and positive patterns
3. **Growth Areas**: Specific, actionable improvements (be direct but constructive)

Keep it personal, honest, and motivating. Avoid generic praise.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{ role: "user", content: aiPrompt }],
      temperature: 0.7,
      max_tokens: 800
    });

    const aiAnalysis = completion.choices[0].message.content || "Analysis could not be generated.";

    // Prepare report data
    const reportData = {
      period: {
        type: reportType,
        startDate,
        endDate
      },
      metrics: {
        totalTasks,
        completedTasks,
        completionPercentage: parseFloat(completionPercentage.toFixed(2)),
        dailyConsistency: parseFloat(dailyConsistency.toFixed(2)),
        activeDays: daysWithCompletedTasks,
        totalDays,
        avgCommitmentScore: parseFloat(avgCommitmentScore.toFixed(2))
      },
      goals: goals.slice(0, 5).map((g: any) => ({
        title: g.title,
        category: g.category,
        status: g.status,
        progress: g.progress || 0
      })),
      tasks: {
        completed: tasks.filter((t: any) => t.status === "completed").length,
        pending: tasks.filter((t: any) => t.status === "pending").length,
        inProgress: tasks.filter((t: any) => t.status === "in_progress").length
      },
      aiAnalysis,
      generatedAt: new Date().toISOString()
    };

    // Save report to database
    const { data: savedReport, error: saveError } = await supabase
      .from("user_reports")
      .insert({
        user_id: user.id,
        report_type: reportType,
        report_date: new Date(endDate).toISOString().split('T')[0],
        report_data: reportData,
        consistency_score: dailyConsistency,
        completion_percentage: completionPercentage
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving report:", saveError);
    }

    return NextResponse.json({
      success: true,
      report: reportData,
      reportId: savedReport?.id
    });

  } catch (error: any) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate report" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve past reports
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "10");

    let query = supabase
      .from("user_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("report_date", { ascending: false })
      .limit(limit);

    if (reportType) {
      query = query.eq("report_type", reportType);
    }

    const { data: reports, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reports });

  } catch (error: any) {
    console.error("Reports fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
