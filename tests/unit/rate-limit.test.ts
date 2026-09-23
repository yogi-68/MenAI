import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Rate limiting is the only thing standing between an authenticated user and
 * unbounded model spend on /api/chat, which was entirely unmetered before.
 * These cover the two behaviours that matter: it counts, and it fails open
 * when Redis is unreachable (an availability decision, unlike the
 * authorization checks, which fail closed).
 */
const store = new Map<string, number>();

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => mockClient,
}));

let mockClient: { incr: (k: string) => Promise<number>; expire: () => Promise<number> } | null = null;

beforeEach(() => {
  store.clear();
  mockClient = {
    incr: async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    },
    expire: async () => 1,
  };
});

afterEach(() => vi.resetModules());

describe("rateLimit", () => {
  it("allows up to the limit then denies", async () => {
    const { rateLimit } = await import("@/lib/api/rate-limit");
    const rule = { limit: 3, windowSeconds: 60 };

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("user-a", rule));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2].remaining).toBe(0);
  });

  it("counts each identifier separately", async () => {
    const { rateLimit } = await import("@/lib/api/rate-limit");
    const rule = { limit: 1, windowSeconds: 60 };

    expect((await rateLimit("user-a", rule)).allowed).toBe(true);
    expect((await rateLimit("user-b", rule)).allowed).toBe(true);
    expect((await rateLimit("user-a", rule)).allowed).toBe(false);
  });

  it("fails open when Redis is unavailable", async () => {
    mockClient = null;
    const { rateLimit } = await import("@/lib/api/rate-limit");
    const result = await rateLimit("user-a", { limit: 1, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });

  it("fails open when Redis throws", async () => {
    mockClient = {
      incr: async () => {
        throw new Error("connection reset");
      },
      expire: async () => 1,
    };
    const { rateLimit } = await import("@/lib/api/rate-limit");
    expect((await rateLimit("user-a", { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });
});
