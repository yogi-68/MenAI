"use client";

/**
 * The daily state check-in.
 *
 * The product's core ritual: one number, optional signals, optional note.
 * Everything downstream — plan sizing, pattern detection, what the coach
 * opens with — is built on this, so it has to be quick enough to do on a bad
 * day. One tap is a complete answer; the rest is optional.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion, motion } from "framer-motion";
import { Check } from "lucide-react";
import { STATE_SCALE, STATE_SIGNALS, bandForScore } from "@/lib/mind/state-scale";
import type { Reset } from "@/lib/mind/resets";

interface CheckinResponse {
  today: { score: number; signals: string[]; note: string | null } | null;
  summary: {
    average: number | null;
    trend: "rising" | "falling" | "flat" | "unknown";
    consistency: { logged: number; window: number };
    suggestedTaskLoad: number;
  };
}

export function StateCheckinCard() {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  const [score, setScore] = useState<number | null>(null);
  const [signals, setSignals] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [suggestedResets, setSuggestedResets] = useState<Reset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CheckinResponse>({
    queryKey: ["mind-state"],
    queryFn: async () => {
      const res = await fetch("/api/mind/state");
      if (!res.ok) throw new Error("Could not load your check-ins");
      return res.json();
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/mind/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, signals, note: note.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save that. Try again.");
      }
      return res.json() as Promise<{ suggestedResets: Reset[] }>;
    },
    onSuccess: (result) => {
      setError(null);
      setSuggestedResets(result.suggestedResets ?? []);
      queryClient.invalidateQueries({ queryKey: ["mind-state"] });
      // Plan sizing depends on this reading, so the plan is now stale.
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["coach-snapshot"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const existing = data?.today;
  const activeScore = score ?? existing?.score ?? null;
  const selected = activeScore ? STATE_SCALE.find((s) => s.score === activeScore) : null;

  const toggleSignal = (signal: string) => {
    setSignals((prev) =>
      prev.includes(signal) ? prev.filter((s) => s !== signal) : [...prev, signal].slice(0, 6)
    );
  };

  if (isLoading) {
    return <div className="skeleton" style={{ height: 240, borderRadius: "var(--radius-lg, 12px)" }} />;
  }

  return (
    <section className="card mind-checkin" aria-labelledby="checkin-heading">
      <header className="mind-checkin__head">
        <h2 id="checkin-heading" className="mind-h2">
          {existing ? "Today, so far" : "Where are you today?"}
        </h2>
        {existing && (
          <span className="mind-badge">
            <Check size={12} aria-hidden="true" /> Logged
          </span>
        )}
      </header>

      <p className="mind-sub">
        {existing
          ? "You can update this if the day has moved."
          : "One number. It's what the plan is sized from."}
      </p>

      <div
        role="radiogroup"
        aria-label="Your state today, 1 to 10"
        className="mind-scale"
      >
        {STATE_SCALE.map((option) => {
          const isSelected = activeScore === option.score;
          return (
            <button
              key={option.score}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${option.score} out of 10, ${option.label}`}
              onClick={() => {
                setScore(option.score);
                setError(null);
              }}
              className={`mind-scale__btn${isSelected ? " is-selected" : ""}`}
              data-band={bandForScore(option.score)}
            >
              {option.score}
            </button>
          );
        })}
      </div>

      {selected && (
        <motion.p
          key={selected.score}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          aria-live="polite"
          className="mind-capacity"
        >
          <strong>{selected.label}.</strong> <span>{selected.capacity}</span>
        </motion.p>
      )}

      <fieldset className="mind-signals">
        <legend className="mind-legend">Anything going on? (optional)</legend>
        <div className="mind-signals__grid">
          {STATE_SIGNALS.map((signal) => {
            const isOn = signals.includes(signal);
            return (
              <button
                key={signal}
                type="button"
                aria-pressed={isOn}
                onClick={() => toggleSignal(signal)}
                className={`chip${isOn ? " is-on" : ""}`}
              >
                {signal}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="mind-note" className="mind-legend">
          Anything worth remembering? (optional)
        </label>
        <textarea
          id="mind-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input-field"
          rows={2}
          maxLength={1000}
          placeholder="What's behind the number"
          style={{ width: "100%", marginTop: 6, resize: "vertical" }}
        />
      </div>

      {error && (
        <p role="alert" className="mind-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => submit.mutate()}
        disabled={!activeScore || submit.isPending}
        className="mind-submit"
      >
        {submit.isPending ? "Saving…" : existing ? "Update today" : "Log today"}
      </button>

      {suggestedResets.length > 0 && (
        <div className="mind-resets" aria-live="polite">
          <p className="mind-legend">That&rsquo;s a hard day. One of these might help:</p>
          <ul className="mind-resets__list">
            {suggestedResets.map((reset) => (
              <li key={reset.id}>
                <strong>{reset.title}</strong>
                <span> · {reset.durationMinutes} min</span>
                <p className="mind-sub">{reset.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
