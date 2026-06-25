"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ClayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const ClayButton = forwardRef<HTMLButtonElement, ClayButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          variant === "primary" && "btn-primary",
          variant === "secondary" && "btn-secondary",
          variant === "ghost" && "btn-secondary !bg-transparent !border-transparent",
          size === "sm" && "!py-2 !px-4 !text-sm",
          size === "lg" && "!py-3.5 !px-7 !text-base",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
ClayButton.displayName = "ClayButton";
