import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function formatRelative(date: string | Date): string {
  const now = new Date();
  const target = new Date(date);
  const diff = now.getTime() - target.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function getMoodEmoji(score: number): string {
  if (score >= 9) return "🤩";
  if (score >= 8) return "😊";
  if (score >= 7) return "🙂";
  if (score >= 6) return "😌";
  if (score >= 5) return "😐";
  if (score >= 4) return "😕";
  if (score >= 3) return "😢";
  if (score >= 2) return "😰";
  return "😞";
}

export function getMoodLabel(score: number): string {
  if (score >= 9) return "Amazing";
  if (score >= 8) return "Great";
  if (score >= 7) return "Good";
  if (score >= 6) return "Okay";
  if (score >= 5) return "Neutral";
  if (score >= 4) return "Low";
  if (score >= 3) return "Sad";
  if (score >= 2) return "Anxious";
  return "Struggling";
}

export function getMoodColor(score: number): string {
  if (score >= 8) return "#5ce0d8";
  if (score >= 6) return "#7c5cfc";
  if (score >= 4) return "#fcb05c";
  return "#fc5c9c";
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}
