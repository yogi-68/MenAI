"use client";

import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";

interface ClayCardProps extends HTMLMotionProps<"div"> {
  inset?: boolean;
  hover?: boolean;
}

export function ClayCard({
  className,
  inset = false,
  hover = true,
  children,
  ...props
}: ClayCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      className={cn(
        inset ? "clay-card-inset" : "clay-card",
        !hover && "hover:!transform-none hover:!shadow-[var(--shadow-clay-outer)]",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
