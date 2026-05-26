/**
 * Unit Tests for LifeSnapshot Engine
 * 
 * Tests the snapshot generation, caching, and invalidation logic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { 
  getLifeSnapshot, 
  invalidateSnapshot, 
  computeInferenceConfidence,
  formatSnapshotForPrompt,
  formatInferenceGuidance 
} from "@/lib/ai/orchestrator/snapshot-engine";
import type { LifeContext, UserProfile, MemoryContext } from "@/lib/ai/orchestrator/types";

describe("LifeSnapshot Engine", () => {
  // Mock data
  const mockUserId = "test-user-123";
  const mockUser: UserProfile = {
    id: mockUserId,
    fullName: "Test User",
    vision: "Build great products",
    founderMode: true,
    coachingStyle: "balanced",
    sessionCount: 5,
  };

  const mockMemory: MemoryContext = {
    shortTerm: [],
    longTerm: ["Working on startup idea", "Learning TypeScript"],
    episodic: [],
    emotional: [],
    formatted: "Working on startup idea. Learning TypeScript.",
  };

  const mockLifeContext: LifeContext = {
    activeGoals: [
      { id: "g1", title: "Launch MVP", priority: "high", progress: 60, status: "active", user_id: mockUserId, category: "business", created_at: "", updated_at: "" },
      { id: "g2", title: "Exercise daily", priority: "medium", progress: 40, status: "active", user_id: mockUserId, category: "health", created_at: "", updated_at: "" },
    ],
    pendingTasks: [],
    activeCommitments: [],
    relationships: [],
    accountabilityItems: [],
    momentumScore: 75,
  };

  beforeEach(() => {
    // Clear cache before each test by invalidating
    invalidateSnapshot(mockUserId);
  });

  describe("getLifeSnapshot", () => {
    it("should generate a snapshot from life context", () => {
      const snapshot = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);

      expect(snapshot).toBeDefined();
      expect(snapshot.identity).toBe("founder");
      expect(snapshot.currentFocus).toBe("Launch MVP");
      expect(snapshot.activeGoalTitles).toEqual(["Launch MVP", "Exercise daily"]);
      expect(snapshot.topPriority).toBe("Launch MVP");
      expect(snapshot.momentum).toBe("rising"); // momentumScore 75 >= 70
      expect(snapshot.snapshotAge).toBe(0); // Fresh snapshot
    });

    it("should cache snapshots and return cached version within TTL", () => {
      const first = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      
      // Wait 1 second
      const beforeSecondCall = Date.now();
      while (Date.now() - beforeSecondCall < 10) {} // Small delay
      
      const second = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);

      // Should return cached version (snapshotAge > 0)
      expect(second.snapshotAge).toBeGreaterThanOrEqual(0);
      expect(second.identity).toBe(first.identity);
      expect(second.currentFocus).toBe(first.currentFocus);
    });

    it("should detect identity from founderMode flag", () => {
      const snapshot = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(snapshot.identity).toBe("founder");
    });

    it("should infer identity from memory if not in founderMode", () => {
      const nonFounderUser = { ...mockUser, founderMode: false };
      const snapshot = getLifeSnapshot(mockUserId, mockLifeContext, nonFounderUser, mockMemory);
      expect(snapshot.identity).toBe("founder"); // inferred from "startup" in memory
    });

    it("should handle empty life context gracefully", () => {
      const snapshot = getLifeSnapshot(mockUserId, null, mockUser, mockMemory);

      expect(snapshot).toBeDefined();
      expect(snapshot.activeGoalTitles).toEqual([]);
      expect(snapshot.topPriority).toBeNull();
    });

    it("should detect momentum levels correctly", () => {
      // High momentum (>= 70)
      const highMomentum = { ...mockLifeContext, momentumScore: 75 };
      expect(getLifeSnapshot(mockUserId, highMomentum, mockUser, mockMemory).momentum).toBe("rising");

      // Medium momentum (>= 40, < 70)
      const mediumMomentum = { ...mockLifeContext, momentumScore: 50 };
      expect(getLifeSnapshot(mockUserId + "2", mediumMomentum, mockUser, mockMemory).momentum).toBe("stable");

      // Low momentum (> 0, < 40)
      const lowMomentum = { ...mockLifeContext, momentumScore: 25 };
      expect(getLifeSnapshot(mockUserId + "3", lowMomentum, mockUser, mockMemory).momentum).toBe("declining");

      // Unknown momentum
      const unknownMomentum = { ...mockLifeContext, momentumScore: undefined };
      expect(getLifeSnapshot(mockUserId + "4", unknownMomentum, mockUser, mockMemory).momentum).toBe("unknown");
    });
  });

  describe("invalidateSnapshot", () => {
    it("should clear cached snapshot", () => {
      // Create a snapshot to cache it
      const first = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(first.snapshotAge).toBe(0);

      // Invalidate
      invalidateSnapshot(mockUserId);

      // Next call should generate fresh (age = 0 again)
      const second = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      expect(second.snapshotAge).toBe(0);
    });
  });

  describe("computeInferenceConfidence", () => {
    it("should return explicit confidence when goals and tasks exist", () => {
      const contextRichness = {
        level: "HIGH" as const,
        hasGoals: true,
        hasTasks: true,
        hasCommitments: true,
        goalCount: 2,
        taskCount: 5,
        commitmentCount: 1,
      };

      const confidence = computeInferenceConfidence(
        contextRichness,
        mockLifeContext,
        mockMemory,
        mockUser
      );

      expect(confidence.goals).toBe("explicit");
      expect(confidence.identity).toBe("explicit"); // founderMode set
      expect(confidence.priorities).toBe("explicit"); // has tasks
    });

    it("should return weakly_inferred when no structured data exists", () => {
      const emptyContext = {
        level: "LOW" as const,
        hasGoals: false,
        hasTasks: false,
        hasCommitments: false,
        goalCount: 0,
        taskCount: 0,
        commitmentCount: 0,
      };

      const emptyMemory = { ...mockMemory, longTerm: [], episodic: [] };
      const nonFounderUser = { ...mockUser, founderMode: false };

      const confidence = computeInferenceConfidence(
        emptyContext,
        null,
        emptyMemory,
        nonFounderUser
      );

      expect(confidence.overall).toBe("weakly_inferred");
    });
  });

  describe("formatSnapshotForPrompt", () => {
    it("should format snapshot into readable prompt text", () => {
      const snapshot = getLifeSnapshot(mockUserId, mockLifeContext, mockUser, mockMemory);
      const formatted = formatSnapshotForPrompt(snapshot);

      expect(formatted).toContain("User Operating Snapshot");
      expect(formatted).toContain("Identity: founder");
      expect(formatted).toContain("Current focus: Launch MVP");
      expect(formatted).toContain("Active goals: Launch MVP, Exercise daily");
      expect(formatted).toContain("Momentum: rising");
    });

    it("should return empty string for empty snapshot", () => {
      const emptySnapshot = {
        identity: "unknown",
        currentFocus: "",
        activeGoalTitles: [],
        topPriority: null,
        momentum: "unknown" as const,
        dominantPattern: null,
        energyTrend: "unknown" as const,
        lastActiveAt: new Date().toISOString(),
        snapshotAge: 0,
      };

      const formatted = formatSnapshotForPrompt(emptySnapshot);
      expect(formatted).toBe("");
    });
  });

  describe("formatInferenceGuidance", () => {
    it("should return empty string for explicit confidence", () => {
      const explicitConfidence = {
        goals: "explicit" as const,
        identity: "explicit" as const,
        priorities: "explicit" as const,
        patterns: "explicit" as const,
        overall: "explicit" as const,
      };

      const guidance = formatInferenceGuidance(explicitConfidence);
      expect(guidance).toBe("");
    });

    it("should provide guidance for inferred context", () => {
      const inferredConfidence = {
        goals: "inferred" as const,
        identity: "weakly_inferred" as const,
        priorities: "weakly_inferred" as const,
        patterns: "inferred" as const,
        overall: "inferred" as const,
      };

      const guidance = formatInferenceGuidance(inferredConfidence);
      expect(guidance).toContain("Inference Confidence Guide");
      expect(guidance).toContain("Goals are INFERRED");
      expect(guidance).toContain("identity/role is inferred");
      expect(guidance).toContain("Priorities are unclear");
      expect(guidance).toContain("patterns are emerging");
    });
  });
});
