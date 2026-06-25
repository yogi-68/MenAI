"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ClaySidebarLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function ClaySidebarLink({ href, icon: Icon, label, active, onClick }: ClaySidebarLinkProps) {
  return (
    <Link
      href={href}
      className={cn("sidebar-link", active && "active")}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={active ? 2 : 1.5} />
      {label}
    </Link>
  );
}
