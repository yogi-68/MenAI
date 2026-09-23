/**
 * Safe error responses.
 *
 * Route handlers must never hand a raw database error to the client: the
 * message can carry column names, constraint names and occasionally row data.
 * Everything funnels through here, which logs the detail server-side and
 * returns a stable, non-revealing shape to the caller.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "quota_exceeded"
  | "conflict"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  quota_exceeded: 429,
  conflict: 409,
  internal: 500,
};

/** What the user reads. Deliberately free of internal detail. */
const MESSAGE: Record<ApiErrorCode, string> = {
  unauthorized: "You need to be signed in.",
  forbidden: "You don't have access to this.",
  not_found: "We couldn't find that.",
  invalid_request: "That request wasn't valid.",
  rate_limited: "You're going a bit fast. Try again shortly.",
  quota_exceeded: "You've reached today's limit. It resets tomorrow.",
  conflict: "That conflicts with something that already exists.",
  internal: "Something went wrong on our side. Try again in a moment.",
};

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  /** Field-level detail, only ever produced by schema validation. */
  details?: Array<{ path: string; message: string }>;
}

export function apiError(
  code: ApiErrorCode,
  options?: {
    /** Overrides the default user-facing message. Must stay non-revealing. */
    message?: string;
    details?: ApiErrorBody["details"];
    headers?: HeadersInit;
  }
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: options?.message ?? MESSAGE[code],
    code,
    ...(options?.details ? { details: options.details } : {}),
  };
  return NextResponse.json(body, { status: STATUS[code], headers: options?.headers });
}

/**
 * Convert an unexpected throw into a 500, logging the real cause.
 * Always returns `internal` — the caller decides nothing, so nothing leaks.
 */
export function apiInternalError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>
): NextResponse<ApiErrorBody> {
  logger.error(`[${scope}] unhandled error`, error, { scope, ...context });
  return apiError("internal");
}

/** Database errors are logged in full and reported as a generic failure. */
export function apiDbError(
  scope: string,
  error: { message: string; code?: string } | null,
  context?: Record<string, unknown>
): NextResponse<ApiErrorBody> {
  logger.error(`[${scope}] database error`, error, { scope, ...context });
  return apiError("internal");
}
