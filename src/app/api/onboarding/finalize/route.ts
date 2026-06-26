import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trackProductEvent } from "@/lib/analytics/track-event";
import {
  finalizeOnboarding,
  FinalizeOnboardingError,
  type FinalizeStep,
} from "@/lib/onboarding/finalize-onboarding";

export const runtime = "nodejs";

function encodeSse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };

      try {
        await finalizeOnboarding(supabase, user.id, async (step: FinalizeStep) => {
          send("step", { step });
        });

        trackProductEvent(user.id, "onboarding_completed").catch(() => {});
        send("done", { ok: true });
      } catch (error) {
        const message =
          error instanceof FinalizeOnboardingError
            ? error.message
            : "Failed to complete onboarding. Please try again.";
        send("error", { message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
