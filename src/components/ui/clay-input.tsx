"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

export const ClayInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("input-field clay-card-inset", className)} {...props} />
  )
);
ClayInput.displayName = "ClayInput";

export const ClaySelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("input-field clay-card-inset", className)} {...props}>
      {children}
    </select>
  )
);
ClaySelect.displayName = "ClaySelect";
