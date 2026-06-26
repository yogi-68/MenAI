/**
 * Prediction Engine — Longitudinal Behavioral Intelligence
 * 
 * This engine moves the AI from interpreting the present to predicting the future.
 * It analyzes execution history (patterns, momentum shifts, abandoned goals) to
 * forecast potential breakdowns or breakthroughs BEFORE they happen.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedLifeData } from "./types";

export interface PredictionGenerationParams {
  userId: string;
  extractedData: ExtractedLifeData;
  conversationId: string;
  serviceClient: SupabaseClient;
}

/**
 * Run the prediction engine to detect new behavioral predictions
 * or validate/invalidate existing ones based on newly extracted data.
 */
export async function evaluatePredictions({
  userId,
  extractedData,
  conversationId,
  serviceClient,
}: PredictionGenerationParams): Promise<void> {
  if (process.env.ENABLE_PREDICTIONS !== "true") {
    return;
  }

  try {
    // 1. Fetch existing execution patterns and active predictions
    const { data: patterns } = await serviceClient
      .from("execution_patterns")
      .select("*")
      .eq("user_id", userId)
      .order("severity", { ascending: false });

    const { data: activePredictions } = await serviceClient
      .from("behavioral_predictions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (!patterns || patterns.length === 0) {
      return; // Not enough history to predict yet
    }

    // 2. Evaluate existing predictions
    if (activePredictions && activePredictions.length > 0) {
      await validateExistingPredictions(userId, activePredictions, extractedData, serviceClient);
    }

    // 3. Generate new predictions based on patterns + current extracted state
    await generateNewPredictions(userId, patterns, activePredictions || [], extractedData, serviceClient);

  } catch (error) {
    console.error("[Prediction Engine] Failed to evaluate predictions:", error);
  }
}

/**
 * Validates or invalidates existing predictions based on new data
 */
async function validateExistingPredictions(
  userId: string,
  predictions: any[],
  newData: ExtractedLifeData,
  serviceClient: SupabaseClient
) {
  for (const prediction of predictions) {
    let newStatus = "active";

    // Simple validation logic (this will get more sophisticated with LLM evaluation)
    if (prediction.prediction_type === "abandonment_risk") {
      // If the user mentioned finishing or continuing the project, invalidate
      if ((newData as any).executionPatterns?.some((p: any) => p.pattern === "overcoming avoidance") || (newData as any).goals.some((g: any) => g.status === "completed")) {
        newStatus = "invalidated";
      }
    } else if (prediction.prediction_type === "momentum_collapse") {
      // If user reports burnout, prediction is validated
      if ((newData as any).emotions?.some((e: any) => JSON.stringify(e).includes("burnout") || JSON.stringify(e).includes("exhaustion"))) {
        newStatus = "validated";
      }
    }

    if (newStatus !== "active") {
      await serviceClient
        .from("behavioral_predictions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", prediction.id);
    }
  }
}

/**
 * Generate new predictions
 */
async function generateNewPredictions(
  userId: string,
  patterns: any[],
  activePredictions: any[],
  newData: ExtractedLifeData,
  serviceClient: SupabaseClient
) {
  const newPredictions = [];

  // Rule 1: Scope Creep -> Abandonment Risk
  const hasPerfectionism = patterns.some(p => p.pattern === "perfectionism" || p.pattern === "scattered_focus");
  const isAddingMultipleGoals = newData.goals.length >= 2;
  const hasActiveAbandonmentRisk = activePredictions.some(p => p.prediction_type === "abandonment_risk");

  if (hasPerfectionism && isAddingMultipleGoals && !hasActiveAbandonmentRisk) {
    newPredictions.push({
      user_id: userId,
      prediction_type: "abandonment_risk",
      trigger_condition: "Expanding scope while having a history of scattered focus",
      predicted_behavior: "High risk of abandoning current projects within 7-14 days due to overwhelm",
      confidence: 0.85,
    });
  }

  // Rule 2: Overwhelm -> Avoidance Loop
  const hasAvoidance = patterns.some(p => p.pattern === "avoidance" || p.pattern === "procrastination");
  const reportsOverwhelm = (newData as any).emotions?.some((e: any) => JSON.stringify(e).includes("overwhelm") || JSON.stringify(e).includes("anx"));
  const hasActiveAvoidanceRisk = activePredictions.some(p => p.prediction_type === "avoidance_loop");

  if (hasAvoidance && reportsOverwhelm && !hasActiveAvoidanceRisk) {
    newPredictions.push({
      user_id: userId,
      prediction_type: "avoidance_loop",
      trigger_condition: "Reporting emotional overwhelm with a history of avoidance",
      predicted_behavior: "Likely to disconnect or avoid high-priority tasks in the next 48 hours",
      confidence: 0.90,
    });
  }

  // Insert if any exist
  if (newPredictions.length > 0) {
    await serviceClient.from("behavioral_predictions").insert(newPredictions);
  }
}
