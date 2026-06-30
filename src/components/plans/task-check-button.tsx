"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

interface TaskCheckButtonProps {
  done: boolean;
  accent: string;
  onClick: () => void;
}

/** Satisfying check animation — under 250ms, respects reduced motion. */
export function TaskCheckButton({ done, accent, onClick }: TaskCheckButtonProps) {
  const reduced = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduced ? undefined : { scale: 0.88 }}
      animate={reduced ? undefined : { scale: done ? [1, 1.15, 1] : 1 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      style={{
        marginTop: 2,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        color: done ? accent : "var(--text-muted)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-label={done ? "Mark task incomplete" : "Mark task complete"}
    >
      {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
    </motion.button>
  );
}
