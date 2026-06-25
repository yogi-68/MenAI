"use client";

import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface ClayCardProps extends HTMLAttributes<HTMLDivElement> {
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
    <div
      className={cn(
        inset ? "card-inset clay-card-inset" : "card clay-card",
        !hover && "hover:!border-[var(--border-color)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
