"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const SEEN_NOTE_KEY = "menai:coach-note-seen";

interface CoachSnapshot {
  dailyNote: string | null;
  precisionCTA: unknown;
}

function hasUnreadInsight(snapshot: CoachSnapshot | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.precisionCTA) return true;
  const note = snapshot.dailyNote?.trim();
  if (!note) return false;
  try {
    return sessionStorage.getItem(SEEN_NOTE_KEY) !== note;
  } catch {
    return false;
  }
}

export function CoachMobileFab() {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  const { data: snapshot } = useQuery({
    queryKey: ["coach-snapshot"],
    queryFn: async () => {
      const res = await fetch("/api/coach/snapshot");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<CoachSnapshot>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const unread = hasUnreadInsight(snapshot);

  const close = useCallback(() => {
    setOpen(false);
    if (snapshot?.dailyNote) {
      try {
        sessionStorage.setItem(SEEN_NOTE_KEY, snapshot.dailyNote.trim());
      } catch {
        /* ignore */
      }
    }
  }, [snapshot?.dailyNote]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="coach-mobile-fab"
        onClick={() => setOpen(true)}
        aria-label="Open coach chat"
      >
        <MessageSquare size={22} />
        {unread && <span className="coach-mobile-fab__dot" aria-hidden />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              className="coach-mobile-sheet-backdrop"
              aria-label="Close coach"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
              onClick={close}
            />
            <motion.div
              className="coach-mobile-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Coach chat"
              initial={reduced ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={reduced ? undefined : { y: "100%" }}
              transition={{ duration: reduced ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
            >
              <div className="coach-mobile-sheet__header">
                <span className="font-display text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Coach
                </span>
                <button
                  type="button"
                  onClick={close}
                  className="coach-mobile-sheet__close"
                  aria-label="Close coach chat"
                >
                  <X size={20} />
                </button>
              </div>
              <iframe
                title="MenAI Coach"
                src="/dashboard/chat/embed"
                className="coach-mobile-sheet__frame"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
