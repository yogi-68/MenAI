import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { assessGoalQuality, assessGoalWithLLM } from "@/lib/goals/goal-quality-gate";

export const runtime = "nodejs";

const BodySchema = z.object({
  title: z.string().trim().min(1, "Tell us what you're working toward.").max(200),
  directions: z.array(z.string().trim().max(120)).max(10).optional(),
  buildingWhat: z.string().trim().max(500).nullable().optional(),
});

export const POST = withAuth(
  { scope: "onboarding/validate-initiative", body: BodySchema, rateLimit: RATE_LIMITS.write },
  async ({ body }) => {
    let assessment = assessGoalQuality(body.title, {
      directions: body.directions,
      buildingWhat: body.buildingWhat ?? null,
    });

    // The heuristic options are usually enough. Only reach for the model when
    // it produced fewer than two, since the LLM tends to return alternatives
    // that are just as vague as the original.
    if (
      assessment.needsSharpening &&
      (assessment.sharpenOptions?.length ?? 0) < 2
    ) {
      const llmSharpen = await assessGoalWithLLM(body.title);
      if (llmSharpen) {
        assessment = {
          ...assessment,
          sharpenPrompt: llmSharpen.sharpenPrompt,
          sharpenOptions: llmSharpen.sharpenOptions,
          message: llmSharpen.message || assessment.message,
        };
      }
    }

    return NextResponse.json({
      valid: assessment.valid,
      kind: assessment.kind,
      quality: assessment.quality,
      needsSharpening: assessment.needsSharpening,
      sharpenPrompt: assessment.sharpenPrompt,
      sharpenOptions: assessment.sharpenOptions,
      exampleTitle: assessment.sharpenOptions?.[0]?.resultTitle,
      title: assessment.title,
      message: assessment.message,
      suggestions: assessment.suggestions,
    });
  }
);
