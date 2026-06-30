"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface ChartCrossfadeProps {
  showData: boolean;
  empty: ReactNode;
  children: ReactNode;
}

/** Crossfade between ghost empty state and populated chart — no layout jump. */
export function ChartCrossfade({ showData, empty, children }: ChartCrossfadeProps) {
  const reduced = useReducedMotion();
  const duration = reduced ? 0 : 0.2;

  return (
    <div style={{ position: "relative", minHeight: 100 }}>
      <AnimatePresence mode="wait" initial={false}>
        {showData ? (
          <motion.div
            key="data"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
          >
            {empty}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
