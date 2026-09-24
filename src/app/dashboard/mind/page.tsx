"use client";

/**
 * Your mind.
 *
 * The surface that makes this a mental performance coach rather than a task
 * list: the daily reading, what it has added up to, and the resets available
 * when state is the thing in the way.
 *
 * Everything here is observed or self-reported, never inferred and presented
 * as fact. Where there isn't enough data to say something honest, it says so
 * instead of filling the space.
 */

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { StateCheckinCard } from "@/components/mind/state-checkin-card";
import { RESETS } from "@/lib/mind/resets";
import { STATE_SCALE } from "@/lib/mind/state-scale";

interface StateResponse {
  summary: {
    average: number | null;
    trend: "rising" | "falling" | "flat" | "unknown";
    commonSignals: Array<{ signal: string; count: number }>;
    consistency: { logged: number; window: number };
    suggestedTaskLoad: number;
  };
  history: Array<{ date: string; score: number; band: string }>;
}

const TREND_COPY = {
  rising: { icon: TrendingUp, label: "Trending up", tone: "var(--accent-success)" },
  falling: { icon: TrendingDown, label: "Trending down", tone: "var(--accent-warning)" },
  flat: { icon: Minus, label: "Holding steady", tone: "var(--text-secondary)" },
  unknown: { icon: Clock, label: "Not enough readings yet", tone: "var(--text-muted)" },
} as const;

export default function MindPage() {
  const { data, isLoading } = useQuery<StateResponse>({
    queryKey: ["mind-state"],
    queryFn: async () => {
      const res = await fetch("/api/mind/state");
      if (!res.ok) throw new Error("Could not load your state");
      return res.json();
    },
  });

  const summary = data?.summary;
  const history = data?.history ?? [];
  const trend = TREND_COPY[summary?.trend ?? "unknown"];
  const TrendIcon = trend.icon;

  // Oldest first, so the sparkline reads left to right as time passes.
  const sparkline = [...history].reverse().slice(-30);
  const hasEnoughForTrend = (summary?.consistency.logged ?? 0) >= 4;

  return (
    <div className="mind-page">
      <header className="mind-page__head">
        <h1 className="mind-h1">Your mind</h1>
        <p className="mind-sub">
          What you&rsquo;ve told us about how you actually work. It gets more useful the
          longer you keep logging.
        </p>
      </header>

      <div className="mind-grid">
        <StateCheckinCard />

        <section className="card" aria-labelledby="pattern-heading">
          <h2 id="pattern-heading" className="mind-h2">
            The pattern
          </h2>

          {isLoading ? (
            <div className="skeleton" style={{ height: 120, borderRadius: "var(--radius-md)" }} />
          ) : (
            <>
              <div className="mind-stats">
                <div>
                  <span className="mind-stat__value" data-numeric>
                    {summary?.average ?? "—"}
                  </span>
                  <span className="mind-stat__label">
                    {summary?.consistency.window ?? 14}-day average
                  </span>
                </div>
                <div>
                  <span className="mind-stat__value" data-numeric>
                    {summary?.consistency.logged ?? 0}
                  </span>
                  <span className="mind-stat__label">days logged</span>
                </div>
                <div>
                  <span className="mind-stat__value" data-numeric>
                    {summary?.suggestedTaskLoad ?? 3}
                  </span>
                  <span className="mind-stat__label">tasks that fit today</span>
                </div>
              </div>

              <p className="mind-trend" style={{ color: trend.tone }}>
                <TrendIcon size={15} aria-hidden="true" />
                {hasEnoughForTrend
                  ? trend.label
                  : "A few more days and we can call a direction"}
              </p>

              {sparkline.length > 1 && (
                <div
                  className="mind-spark"
                  role="img"
                  aria-label={`State over the last ${sparkline.length} readings`}
                >
                  {sparkline.map((point) => (
                    <span
                      key={point.date}
                      className="mind-spark__bar"
                      data-band={point.band}
                      style={{ height: `${(point.score / 10) * 100}%` }}
                      title={`${point.date}: ${point.score}/10`}
                    />
                  ))}
                </div>
              )}

              {summary && summary.commonSignals.length > 0 && (
                <div className="mind-recurring">
                  <p className="mind-legend">What keeps coming up</p>
                  <ul className="mind-recurring__list">
                    {summary.commonSignals.map(({ signal, count }) => (
                      <li key={signal}>
                        <span>{signal}</span>
                        <span className="mind-count" data-numeric>
                          {count}×
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(summary?.consistency.logged ?? 0) === 0 && (
                <p className="mind-sub" style={{ marginTop: 16 }}>
                  Nothing here yet. Log today and this fills in.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="resets-heading">
        <h2 id="resets-heading" className="mind-h2">
          Resets
        </h2>
        <p className="mind-sub">
          Short, specific things to do when your state is what&rsquo;s in the way. Not
          treatment — just what tends to work.
        </p>

        <ul className="mind-resets__grid">
          {RESETS.map((reset) => (
            <li key={reset.id} className="mind-reset-card">
              <div className="mind-reset-card__head">
                <h3 className="mind-h3">{reset.title}</h3>
                <span className="mind-count" data-numeric>
                  {reset.durationMinutes} min
                </span>
              </div>
              <p className="mind-sub">{reset.summary}</p>
              <p className="mind-usewhen">
                <strong>Use it when:</strong> {reset.useWhen}
              </p>
              <details>
                <summary className="mind-steps-toggle">The {reset.steps.length} steps</summary>
                <ol className="mind-steps">
                  {reset.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="scale-heading">
        <h2 id="scale-heading" className="mind-h2">
          What the numbers mean
        </h2>
        <ul className="mind-scale-legend">
          {STATE_SCALE.map((option) => (
            <li key={option.score}>
              <span className="mind-count" data-numeric>
                {option.score}
              </span>
              <span className="mind-scale-legend__label">{option.label}</span>
              <span className="mind-sub">{option.capacity}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
