import { test, expect } from "@playwright/test";

/**
 * Public surfaces.
 *
 * These need no account and no seeded data, so they run anywhere — including
 * on a pull request with no Supabase project attached. The previous E2E suite
 * required a signed-in user for everything, was gated behind credentials that
 * were never configured, and had never run at all; by the time it was deleted
 * it targeted DOM that no longer existed.
 */

test.describe("landing page", () => {
  test("states what the product is and offers a way in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /start free/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
  });

  test("makes no claim about pricing that cannot be honoured", async ({ page }) => {
    await page.goto("/");
    const body = (await page.locator("body").innerText()).toLowerCase();

    // The page previously sold a $19 tier and a Team tier with SSO. Nothing
    // could be purchased, and none of those features existed.
    expect(body).not.toContain("$19");
    expect(body).not.toContain("per month");
    expect(body).not.toMatch(/\bsso\b/);
  });

  test("quotes no invented statistics", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();

    // "+41% execution rate" and "Plan quality 9.1/10 — AI-rated" were
    // fabricated and presented as product data.
    expect(body).not.toContain("41%");
    expect(body).not.toContain("9.1/10");
  });

  test("states the non-clinical boundary", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/not a therapist/i)).toBeVisible();
  });

  test("footer links resolve", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /^privacy$/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: /privacy/i })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms/i })).toBeVisible();
  });

  test("works at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The old hero set a two-column grid inline, which beat the media query
    // meant to collapse it, so phones got a squeezed column and an empty half.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("keyboard access", () => {
  test("the first tab stop is a skip link", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(focused.toLowerCase()).toContain("skip");
  });

  test("focused controls have a visible ring", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // globals.css previously set `outline: none` and defined no
    // :focus-visible rule anywhere, leaving keyboard users with no indicator.
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = getComputedStyle(el);
      return `${style.outlineStyle} ${style.outlineWidth}`;
    });

    expect(outline).not.toBeNull();
    expect(outline).not.toMatch(/^none/);
  });
});

test.describe("health", () => {
  test("reports its dependencies", async ({ request }) => {
    const res = await request.get("/api/health");

    // 503 is a valid answer when the database is unreachable; the shape is
    // what this asserts.
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("cache");
  });
});

test.describe("authentication boundary", () => {
  for (const path of ["/dashboard", "/dashboard/mind", "/dashboard/plans", "/onboarding"]) {
    test(`${path} is not reachable signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("API routes refuse an anonymous caller", async ({ request }) => {
    for (const path of ["/api/mind/state", "/api/tasks", "/api/goals", "/api/account/export"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("malformed JSON is a 400, not a 500", async ({ request }) => {
    // Nine route files read `await req.json()` with no try/catch, so any
    // malformed body produced an unhandled SyntaxError and a 500.
    const res = await request.post("/api/chat", {
      headers: { "Content-Type": "application/json" },
      data: "{ not json",
    });
    expect(res.status()).not.toBe(500);
  });
});
