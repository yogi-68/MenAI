"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";

interface AnimatedScoreProps {
  value: number;
  className?: string;
}

/** Count-up transition when score changes — not on every render. */
export function AnimatedScore({ value, className }: AnimatedScoreProps) {
  const reduced = useReducedMotion();
  const spring = useSpring(value, { stiffness: 120, damping: 22, duration: reduced ? 0 : 0.25 });
  const display = useTransform(spring, (v) => String(Math.round(v)));
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      spring.set(value);
      prev.current = value;
    }
  }, [value, spring]);

  if (reduced) {
    return (
      <span className={className} data-numeric>
        {value}
      </span>
    );
  }

  return (
    <motion.span className={className} data-numeric>
      {display}
    </motion.span>
  );
}
