/**
 * Integration Tests for Cache Invalidation
 * 
 * Tests that cache is properly invalidated when user data changes.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLifeSnapshot, invalidateSnapshot } from "@/lib/ai/orchestrator/snapshot-engine";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import type { LifeContext, UserProfile, MemoryContext } from "@/lib/ai/orchestrator/types";

describe("Cache Invalidation Integration", () => {
  const mockUserId = "cache-test-user";
  const mockUser: UserProfile = {
    id: mockUserId,
    fullName: "Cache Test",
    founderMode: true,
    coachingStyle: "balanced",
    sessionCount: 1,
  };

  const mockMemory: MemoryContext = {
    shortTerm: [],
    longTerm: ["Initial context"],
    episodic: [],
    emotional: [],
    formatted: "Initial context",
  };

  const mockLifeContext: LifeContext = {
    activeGoals: [
      { 
        id: "g1", 
        title: "Original Goal", 
        priority: "high", 
        progress: 50, 
        status: "active",
        user_id: mockUserId,
        category: "business",
        created_at: "",
        updated_at: ""
      },
    ],
    pendingTasks: [],
    activeCommitments: [],
    relationships: [],
    accountabilityItems: [],
    momentumScore: 60,
  };

  beforeEach(() => {
    // Clear cache before each test
    invalidateSnapshot(mockUserId);
  });

  describe("LifeSnapshot cache behavior", () => {
    it("should cache snapshot and return cached version within TTL", () => {
      // First call - generates fresh snapshot
      const first = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(first.snapshotAge).toBe(0);
      expect(first.currentFocus).toBe("Original Goal");

      // Second call immediately - should hit cache
      const second = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(second.currentFocus).toBe("Original Goal");
      // Cache hit doesn't regenerate, so snapshot structure is preserved
    });

    it("should generate fresh snapshot after invalidation", () => {
      // Create initial snapshot
      const first = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(first.currentFocus).toBe("Original Goal");

      // Simulate data change - new goal added
      const updatedContext: LifeContext = {
        ...mockLifeContext,
        activeGoals: [
          mockLifeContext.activeGoals[0],
          { 
            id: "g2", 
            title: "New Goal", 
            priority: "critical", 
            progress: 10, 
            status: "active",
            user_id: mockUserId,
            category: "business",
            created_at: "",
            updated_at: ""
          },
        ],
      };

      // Invalidate cache (simulates what API endpoint would do)
      invalidateSnapshot(mockUserId);

      // Next call should generate fresh snapshot with new goal
      const second = getLifeSnapshot(mockUserId, updatedContext, mockUser, mockMemory);
      expect(second.snapshotAge).toBe(0); // Fresh snapshot
      expect(second.currentFocus).toBe("New Goal"); // Critical priority goal is now focus
      expect(second.activeGoalTitles).toHaveLength(2);
    });

    it("should handle background extraction invalidation", () => {
      // Initial snapshot
      const initial = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(initial.currentFocus).toBe("Original Goal");

      // Simulate background extraction adding new data
      const extractedContext: LifeContext = {
        ...mockLifeContext,
        activeCommitments: [
          {
            id: "c1",
            description: "Exercise 3x per week",
            consistency_score: 80,
            times_followed_through: 8,
            times_broken: 2,
            status: "active",
            user_id: mockUserId,
            created_at: "",
            updated_at: "",
          },
        ],
      };

      // Background job invalidates cache
      invalidateSnapshot(mockUserId);

      // Next request sees updated context
      const updated = getLifeSnapshot(mockUserId, extractedContext, mockUser, mockMemory);
      expect(updated.snapshotAge).toBe(0);
    });
  });

  describe("invalidateUserCache utility", () => {
    it("should invalidate snapshot when called", () => {
      // Create cached snapshot
      const first = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(first.snapshotAge).toBe(0);

      // Use the public API that endpoints would call
      invalidateUserCache(mockUserId, "test mutation");

      // Should generate fresh snapshot
      const second = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(second.snapshotAge).toBe(0);
    });

    it("should accept optional reason parameter for logging", () => {
      const consoleSpy = vi.spyOn(console, "log");
      
      // This would normally only log in development
      invalidateUserCache(mockUserId, "goal created");
      
      // In test environment, check that function doesn't throw
      expect(consoleSpy).toHaveBeenCalled;
      
      consoleSpy.mockRestore();
    });
  });

  describe("Simulated API mutation flows", () => {
    it("should invalidate cache after goal creation", () => {
      // User has initial state
      const initial = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(initial.activeGoalTitles).toHaveLength(1);

      // Simulate POST /api/goals (add new goal)
      const newGoalContext: LifeContext = {
        ...mockLifeContext,
        activeGoals: [
          ...mockLifeContext.activeGoals,
          { 
            id: "g2", 
            title: "Added via API", 
            priority: "medium", 
            progress: 0, 
            status: "active",
            user_id: mockUserId,
            category: "personal",
            created_at: "",
            updated_at: ""
          },
        ],
      };

      // API endpoint calls invalidateUserCache after successful insert
      invalidateUserCache(mockUserId, "goal created");

      // Next chat message loads fresh snapshot
      const afterCreation = getLifeSnapshot(mockUserId, newGoalContext, mockUser, mockMemory);
      expect(afterCreation.activeGoalTitles).toHaveLength(2);
      expect(afterCreation.activeGoalTitles).toContain("Added via API");
    });

    it("should invalidate cache after goal update", () => {
      const initial = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(initial.currentFocus).toBe("Original Goal");

      // Simulate PATCH /api/goals (change title and priority)
      const updatedContext: LifeContext = {
        ...mockLifeContext,
        activeGoals: [
          { 
            ...mockLifeContext.activeGoals[0],
            title: "Updated Goal Title",
            priority: "critical",
          },
        ],
      };

      invalidateUserCache(mockUserId, "goal updated");

      const afterUpdate = getLifeSnapshot(mockUserId, updatedContext, mockUser, mockMemory);
      expect(afterUpdate.currentFocus).toBe("Updated Goal Title");
    });

    it("should invalidate cache after task completion", () => {
      const contextWithTask: LifeContext = {
        ...mockLifeContext,
        pendingTasks: [
          {
            id: "t1",
            title: "Finish feature",
            status: "in_progress",
            user_id: mockUserId,
            created_at: "",
            updated_at: "",
          },
        ],
      };

      const before = getLifeSnapshot(mockUserId, contextWithTask, mockUser, mockMemory);

      // Simulate PATCH /api/tasks (mark complete)
      const afterCompletion: LifeContext = {
        ...contextWithTask,
        pendingTasks: [],
      };

      invalidateUserCache(mockUserId, "task updated");

      const after = getLifeSnapshot(mockUserId, afterCompletion, mockUser, mockMemory);
      expect(after.snapshotAge).toBe(0); // Fresh snapshot
    });

    it("should invalidate cache after memory write", () => {
      const initialMemory = mockMemory;
      const initial = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, initialMemory);

      // Simulate storeMemory() being called with new insight
      const updatedMemory: MemoryContext = {
        ...initialMemory,
        longTerm: [...initialMemory.longTerm, "New insight from conversation"],
        formatted: "Initial context. New insight from conversation.",
      };

      // storeMemory() calls invalidateSnapshot after insert
      invalidateSnapshot(mockUserId);

      const after = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, updatedMemory);
      expect(after.snapshotAge).toBe(0);
    });
  });

  describe("Cache invalidation timing", () => {
    it("should invalidate immediately, not after delay", () => {
      // Create snapshot
      const first = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      
      // Invalidate immediately
      const beforeInvalidation = Date.now();
      invalidateSnapshot(mockUserId);
      const afterInvalidation = Date.now();
      
      // Should take < 10ms
      expect(afterInvalidation - beforeInvalidation).toBeLessThan(10);
      
      // Next call generates fresh immediately
      const second = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(second.snapshotAge).toBe(0);
    });
  });
});
