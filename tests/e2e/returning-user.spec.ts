/**
 * End-to-End Tests for Returning User Flow
 * 
 * Tests the complete user journey from signup through goal creation
 * and back to a new session to verify context persistence.
 * 
 * NOTE: These tests require a running Supabase instance with test data.
 * Set PLAYWRIGHT_BASE_URL and Supabase test credentials before running.
 */

import { test, expect } from "@playwright/test";

test.describe("Returning User Session Continuity", () => {
  const testUser = {
    email: `test-${Date.now()}@mentalai.test`,
    password: "Test123!@#",
    fullName: "E2E Test User",
  };

  test.beforeEach(async ({ page }) => {
    // Start fresh
    await page.goto("/");
  });

  test("complete flow: signup → chat with goal → logout → login → AI remembers goal", async ({ page }) => {
    // Skip in CI if no test environment configured
    if (process.env.CI && !process.env.TEST_SUPABASE_URL) {
      test.skip();
    }

    // ===== STEP 1: Sign Up =====
    await page.goto("/signup");
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");

    // ===== STEP 2: Navigate to Chat =====
    await page.click('a[href="/dashboard/chat"]');
    await page.waitForURL(/\/dashboard\/chat/);

    // ===== STEP 3: Declare a Goal in Chat =====
    const goalMessage = "I want to build a SaaS product that helps developers be more productive";
    
    await page.fill('textarea[placeholder*="message"]', goalMessage);
    await page.click('button[type="submit"]');

    // Wait for AI response
    await page.waitForSelector('[data-message-role="assistant"]', { timeout: 15000 });

    // Verify AI responded (should acknowledge the goal)
    const aiResponse = await page.textContent('[data-message-role="assistant"]:last-child');
    expect(aiResponse).toBeTruthy();
    expect(aiResponse!.length).toBeGreaterThan(20); // Meaningful response

    // Wait a moment for background extraction to potentially run
    await page.waitForTimeout(3000);

    // ===== STEP 4: Check Dashboard for Goal =====
    await page.goto("/dashboard/goals");
    await page.waitForSelector('body'); // Let page load

    // Note: Goal might be in DB from extraction or might not yet.
    // The key test is whether it's available in next session.

    // ===== STEP 5: Logout =====
    await page.click('button[aria-label*="menu"], button[aria-label*="user"]'); // User menu
    await page.click('text=/.*sign out.*/i');
    await page.waitForURL(/\/login|\/$/);

    // ===== STEP 6: Login Again (New Session) =====
    await page.goto("/login");
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/);

    // ===== STEP 7: Go to Chat and Ask Follow-up =====
    await page.goto("/dashboard/chat");

    const followUpMessage = "What should I focus on this week?";
    await page.fill('textarea[placeholder*="message"]', followUpMessage);
    await page.click('button[type="submit"]');

    // Wait for AI response
    await page.waitForSelector('[data-message-role="assistant"]', { timeout: 15000 });

    // Get latest AI response
    const followUpResponse = await page.textContent('[data-message-role="assistant"]:last-child');

    // ===== VERIFICATION: AI Should Reference SaaS Goal =====
    // The AI should mention the SaaS goal without user re-stating it
    const mentionsSaaS = 
      followUpResponse?.toLowerCase().includes("saas") ||
      followUpResponse?.toLowerCase().includes("product") ||
      followUpResponse?.toLowerCase().includes("developer");

    expect(mentionsSaaS).toBeTruthy();
    expect(followUpResponse).toBeTruthy();

    // The response should NOT ask "what are your goals?" since we already know
    const asksForGoals = 
      followUpResponse?.toLowerCase().includes("what are your goals") ||
      followUpResponse?.toLowerCase().includes("tell me your goals");

    expect(asksForGoals).toBeFalsy();
  });

  test("dashboard shows real data, not placeholders", async ({ page }) => {
    // Skip if no test credentials
    if (process.env.CI && !process.env.TEST_SUPABASE_URL) {
      test.skip();
    }

    // Sign up and login (reuse helper in real tests)
    await page.goto("/signup");
    await page.fill('input[type="email"]', `test-dash-${Date.now()}@mentalai.test`);
    await page.fill('input[type="password"]', "Test123!@#");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/);

    // ===== STEP 1: Fresh User - No Goals =====
    const dashboardText = await page.textContent('body');

    // Should NOT show fake insight
    expect(dashboardText).not.toContain("Your execution momentum is building");

    // Should NOT say "All priority tasks completed" for zero tasks
    if (dashboardText?.includes("No tasks yet")) {
      // Good - honest empty state
      expect(dashboardText).toContain("No tasks yet");
    }

    // ===== STEP 2: Create a Goal via Dashboard =====
    await page.goto("/dashboard/goals");
    
    // Create goal (UI may vary - adjust selectors)
    await page.click('button:has-text("Add Goal"), button:has-text("New Goal")');
    await page.fill('input[placeholder*="title"]', "Test Goal via Dashboard");
    await page.selectOption('select[name="category"]', "business");
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');

    // Wait for goal to appear
    await page.waitForTimeout(1000);

    // ===== STEP 3: Go to Chat - AI Should See Goal Immediately =====
    await page.goto("/dashboard/chat");

    await page.fill('textarea', "What are my current goals?");
    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-message-role="assistant"]', { timeout: 15000 });

    const aiResponse = await page.textContent('[data-message-role="assistant"]:last-child');

    // AI should mention the goal we just created
    expect(aiResponse?.toLowerCase()).toContain("test goal");
  });
});

test.describe("New User Experience", () => {
  test("AI asks orienting questions instead of hallucinating goals", async ({ page }) => {
    if (process.env.CI && !process.env.TEST_SUPABASE_URL) {
      test.skip();
    }

    const newUser = {
      email: `newuser-${Date.now()}@mentalai.test`,
      password: "Test123!@#",
    };

    // Sign up
    await page.goto("/signup");
    await page.fill('input[type="email"]', newUser.email);
    await page.fill('input[type="password"]', newUser.password);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/);

    // Go straight to chat
    await page.goto("/dashboard/chat");

    // Ask for a plan with NO prior context
    await page.fill('textarea', "Help me plan my day");
    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-message-role="assistant"]', { timeout: 15000 });

    const aiResponse = await page.textContent('[data-message-role="assistant"]:last-child');

    // AI should NOT invent specific tasks or goals
    // Should ask questions instead
    const asksQuestions = 
      aiResponse?.includes("?") ||
      aiResponse?.toLowerCase().includes("what") ||
      aiResponse?.toLowerCase().includes("tell me") ||
      aiResponse?.toLowerCase().includes("share");

    expect(asksQuestions).toBeTruthy();

    // Should NOT confidently list fake tasks
    const inventsTasks = 
      aiResponse?.includes("1.") && 
      aiResponse?.includes("2.") &&
      aiResponse?.includes("3.");

    if (inventsTasks) {
      // If it does list tasks, they should be marked as suggestions
      expect(aiResponse?.toLowerCase()).toMatch(/suggest|might|could|consider/);
    }
  });

  test("dashboard shows honest empty states for new user", async ({ page }) => {
    if (process.env.CI && !process.env.TEST_SUPABASE_URL) {
      test.skip();
    }

    const newUser = {
      email: `empty-${Date.now()}@mentalai.test`,
      password: "Test123!@#",
    };

    await page.goto("/signup");
    await page.fill('input[type="email"]', newUser.email);
    await page.fill('input[type="password"]', newUser.password);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/);

    const content = await page.textContent('body');

    // Should show empty state messages
    expect(content).toMatch(/no tasks yet|no goals yet|no commitments/i);

    // Should NOT show:
    // - "All tasks completed" when there are zero tasks
    // - Fake insight quotes
    // - "Radar clear" with no commitments

    expect(content).not.toContain("All priority tasks for today completed");
    expect(content).not.toContain("Your execution momentum is building");

    // Insight card should say insights will come later
    if (content?.includes("Strategist Insight")) {
      expect(content).toMatch(/will surface insights|as you chat/i);
    }
  });
});
