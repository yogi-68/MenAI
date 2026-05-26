/**
 * Test Setup and Utilities
 * 
 * Global setup for Vitest tests including:
 * - Environment variable configuration
 * - Mock Supabase client setup
 * - Test database helpers
 */

import { beforeAll, afterAll, beforeEach } from "vitest";

// Set test environment variables
beforeAll(() => {
  // @ts-expect-error - NODE_ENV is readonly in TypeScript types
  process.env.NODE_ENV = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.TEST_SUPABASE_URL || "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "test-service-key";
});

// Cleanup after all tests
afterAll(() => {
  // Clean up test data if needed
});

// Reset state before each test
beforeEach(() => {
  // Reset any global state or mocks
});
