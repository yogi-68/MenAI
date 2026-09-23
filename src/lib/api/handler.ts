/**
 * Route handler composition.
 *
 * Before this module, all 38 authenticated routes repeated the same three-line
 * session check by hand, parsed bodies with a bare `await req.json()` (which
 * throws a 500 on malformed input), and had no validation at all. These
 * helpers make the guarded path the shortest one to write.
 */

import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { ZodType, infer as ZodInfer } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError, apiInternalError, type ApiErrorBody } from "./errors";
import { rateLimit, rateLimitHeaders, type RateLimitRule } from "./rate-limit";
import { logger, requestIdFrom } from "@/lib/observability/logger";

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface RouteContext<TBody = undefined, TQuery = undefined> {
  req: NextRequest;
  user: User;
  supabase: SupabaseServerClient;
  /** Parsed and validated body. `undefined` when no body schema was given. */
  body: TBody;
  /** Parsed and validated query string. `undefined` when no query schema. */
  query: TQuery;
  requestId: string;
  log: ReturnType<typeof logger.child>;
}

export interface RouteOptions<TBodySchema, TQuerySchema> {
  /** Logical name, used for logs and error correlation. */
  scope: string;
  /** Validates the JSON body. Its absence means the body is never read. */
  body?: TBodySchema;
  /** Validates `searchParams`, flattened to a plain string record first. */
  query?: TQuerySchema;
  /** Applied per user id, after authentication. */
  rateLimit?: RateLimitRule;
}

/**
 * Wrap an authenticated route handler.
 *
 * Order matters: authenticate, then rate-limit (so the limit is per user, not
 * per IP), then validate, then run. Anything that throws inside the handler
 * becomes a logged 500 with no detail leaked.
 */
export function withAuth<
  TBodySchema extends ZodType | undefined = undefined,
  TQuerySchema extends ZodType | undefined = undefined,
>(
  options: RouteOptions<TBodySchema, TQuerySchema>,
  handler: (
    ctx: RouteContext<
      TBodySchema extends ZodType ? ZodInfer<TBodySchema> : undefined,
      TQuerySchema extends ZodType ? ZodInfer<TQuerySchema> : undefined
    >
  ) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = requestIdFrom(req.headers);
    const log = logger.child({ requestId, scope: options.scope });

    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return apiError("unauthorized");

      if (options.rateLimit) {
        const result = await rateLimit(`${options.scope}:${user.id}`, options.rateLimit);
        if (!result.allowed) {
          log.warn("rate limited", { userId: user.id });
          return apiError("rate_limited", { headers: rateLimitHeaders(result) });
        }
      }

      let body: unknown = undefined;
      if (options.body) {
        const raw = await readJson(req);
        if (raw === MALFORMED) return apiError("invalid_request", { message: "Invalid JSON body." });

        const parsed = options.body.safeParse(raw);
        if (!parsed.success) return validationFailure(parsed.error);
        body = parsed.data;
      }

      let query: unknown = undefined;
      if (options.query) {
        const params = Object.fromEntries(new URL(req.url).searchParams.entries());
        const parsed = options.query.safeParse(params);
        if (!parsed.success) return validationFailure(parsed.error);
        query = parsed.data;
      }

      return await handler({
        req,
        user,
        supabase,
        requestId,
        log: logger.child({ requestId, scope: options.scope, userId: user.id }),
        // Cast is safe: presence of the schema determines presence of the value.
        body: body as never,
        query: query as never,
      });
    } catch (error) {
      return apiInternalError(options.scope, error, { requestId });
    }
  };
}

/** Sentinel distinguishing "malformed JSON" from a legitimate `null` body. */
const MALFORMED = Symbol("malformed-json");

async function readJson(req: NextRequest): Promise<unknown | typeof MALFORMED> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return MALFORMED;
  }
}

interface ZodIssueLike {
  path: Array<string | number | symbol>;
  message: string;
}

function validationFailure(error: { issues: ZodIssueLike[] }): NextResponse<ApiErrorBody> {
  return apiError("invalid_request", {
    details: error.issues.slice(0, 10).map((issue) => ({
      path: issue.path.map(String).join(".") || "(root)",
      message: issue.message,
    })),
  });
}
