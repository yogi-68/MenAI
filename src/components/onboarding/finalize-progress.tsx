"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const STEPS = [
  { id: "creating_goal", label: "Creating your goal" },
  { id: "building_milestones", label: "Building your milestones" },
  { id: "generating_plan", label: "Generating today's plan" },
  { id: "setting_up_coach", label: "Setting up your coach" },
] as const;

type StepId = (typeof STEPS)[number]["id"] | "done";

export function FinalizeProgress() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepId>("creating_goal");
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/onboarding/finalize", { method: "POST" });
        if (!res.ok || !res.body) {
          throw new Error("Failed to start onboarding setup");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const lines = chunk.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.replace("event:", "").trim();
            const data = JSON.parse(dataLine.replace("data:", "").trim()) as {
              step?: string;
              message?: string;
            };

            if (event === "step" && data.step) {
              setDoneSteps((prev) => {
                const next = new Set(prev);
                const idx = STEPS.findIndex((s) => s.id === data.step);
                STEPS.slice(0, idx).forEach((s) => next.add(s.id));
                return next;
              });
              setActiveStep(data.step as StepId);
            }

            if (event === "error") {
              setError(data.message || "Something went wrong");
              return;
            }

            if (event === "done") {
              setDoneSteps(new Set(STEPS.map((s) => s.id)));
              setActiveStep("done");
              await fetch("/api/dashboard/snapshot", { method: "POST" });
              router.replace("/dashboard/plans");
              return;
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Setup failed");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-2 font-display text-2xl font-semibold text-[var(--text-primary)]">
        Setting up MenAI
      </h1>
      <p className="mb-8 text-sm text-[var(--text-secondary)]">
        Building your goal, milestones, and first plan — this usually takes a few seconds.
      </p>

      <ul className="w-full space-y-3 text-left">
        {STEPS.map((step) => {
          const completed = doneSteps.has(step.id) || activeStep === "done";
          const active = activeStep === step.id && !completed;

          return (
            <li
              key={step.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3"
            >
              {completed ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--accent-primary)]" />
              ) : active ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent-primary)]" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
              )}
              <span
                className={
                  completed || active
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-6 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
