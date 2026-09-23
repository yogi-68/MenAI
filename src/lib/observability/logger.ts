/**
 * Structured logger.
 *
 * Replaces bare console.* calls so that production logs are machine-readable
 * and carry correlation identifiers. Two rules matter here:
 *
 *   1. Never log PII. User identity is carried as an opaque id, never as a
 *      name or email address. `redact()` enforces this for arbitrary payloads.
 *   2. Never throw. A logger that can fail is a logger that takes the request
 *      down with it.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

/** Keys whose values are dropped entirely, at any depth. */
const PII_KEYS = new Set([
  "email",
  "full_name",
  "fullname",
  "name",
  "avatar_url",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "apikey",
  "api_key",
  "authorization",
]);

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Strip PII from a log payload. Depth-limited so a cyclic object can't hang. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;

  if (typeof value === "string") {
    return value.replace(EMAIL_PATTERN, "[email]");
  }
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = PII_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(val, depth + 1);
  }
  return out;
}

export interface LogContext {
  /** Correlates every line emitted while handling one request. */
  requestId?: string;
  /** Opaque user id. Never a name or an email address. */
  userId?: string;
  /** Logical area, e.g. "chat", "cron", "plans". */
  scope?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  try {
    const line: Record<string, unknown> = {
      level,
      msg: message,
      time: new Date().toISOString(),
      ...(context ? (redact(context) as Record<string, unknown>) : {}),
    };

    if (error !== undefined) {
      line.error =
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : redact(error);
    }

    const serialized = JSON.stringify(line);
    if (level === "error") console.error(serialized);
    else if (level === "warn") console.warn(serialized);
    else console.log(serialized);
  } catch {
    // A logger must never take down the request that called it.
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit("error", message, context, error),

  /** Bind a context once and reuse it for the life of a request. */
  child(bound: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        emit("debug", message, { ...bound, ...context }),
      info: (message: string, context?: LogContext) =>
        emit("info", message, { ...bound, ...context }),
      warn: (message: string, context?: LogContext) =>
        emit("warn", message, { ...bound, ...context }),
      error: (message: string, error?: unknown, context?: LogContext) =>
        emit("error", message, { ...bound, ...context }, error),
    };
  },
};

/** Correlation id for one request. Prefers the platform-provided id. */
export function requestIdFrom(headers: Headers): string {
  return (
    headers.get("x-vercel-id") ??
    headers.get("x-request-id") ??
    globalThis.crypto.randomUUID()
  );
}
