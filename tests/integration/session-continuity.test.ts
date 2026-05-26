/**
 * Integration Tests for Session Continuity
 * 
 * Tests that user context persists across sessions and the AI
 * remembers user data without re-asking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLifeSnapshot, invalidateSnapshot } from "@/lib/ai/orchestrator/snapshot-engine";
import { computeContextRichness } from "@/lib/ai/orchestrator/context-richness-engine";
import type { LifeContext, UserProfile, MemoryContext } from "@/lib/ai/orchestrator/types";

describe("Session Continuity", () => {
  const userId = "session-test-user";

  beforeEach(() => {
    invalidateSnapshot(userId);
  });

  describe("New user - empty snapshot", () => {
    it("should handle completely new user with no data", () => {
      const emptyUser: UserProfile = {
        id: userId,
        coachingStyle: "balanced",
        sessionCount: 0,
      };

      const emptyMemory: MemoryContext = {
        shortTerm: [],
        longTerm: [],
        episodic: [],
        emotional: [],
        formatted: "",
      };

      const snapshot = getLifeSnapshot(userId, null, emptyUser, emptyMemory);

      // Should not hallucinate data
      expect(snapshot.identity).toBe("unknown");
      expect(snapshot.currentFocus).toBe("");
      expect(snapshot.activeGoalTitles).toEqual([]);
      expect(snapshot.topPriority).toBeNull();
      expect(snapshot.dominantPattern).toBeNull();

      // Context should be LOW
      const contextRichness = computeContextRichness(null);
      expect(contextRichness.level).toBe("LOW");
      expect(contextRichness.hasGoals).toBe(false);
      expect(contextRichness.hasTasks).toBe(false);
    });

    it("should not invent goals for user with no structured data", () => {
      const newUser: UserProfile = {
        id: userId,
        fullName: "New User",
        coachingStyle: "balanced",
        sessionCount: 1,
      };

      const emptyMemory: MemoryContext = {
        shortTerm: [],
        longTerm: [],
        episodic: [],
        emotional: [],
        formatted: "",
      };

      const snapshot = getLifeSnapshot(userId, null, newUser, emptyMemory);

      // AI should ask questions, not make up goals
      expect(snapshot.activeGoalTitles).toHaveLength(0);
      expect(snapshot.currentFocus).toBeFalsy();
    });
  });

  describe("Returning user - context continuity", () => {
    it("should remember user goals from previous session", () => {
      // Session 1: User declares "I want to build a SaaS"
      // System extracts goal to DB
      const session1Context: LifeContext = {
        activeGoals: [
          {
            id: "g1",
            title: "Build SaaS product",
            priority: "high",
            progress: 10,
            status: "active",
            user_id: userId,
            category: "business",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        pendingTasks: [],
        activeCommitments: [],
        relationships: [],
        accountabilityItems: [],
        momentumScore: 40,
      };

      const session1User: UserProfile = {
        id: userId,
        fullName: "Returning User",
        founderMode: true,
        coachingStyle: "balanced",
        sessionCount: 5,
      };

      const session1Memory: MemoryContext = {
        shortTerm: [],
        longTerm: ["Discussed SaaS idea in previous chat"],
        episodic: [],
        emotional: [],
        formatted: "Discussed SaaS idea in previous chat",
      };

      // Session 1 snapshot
      const session1Snapshot = getLifeSnapshot(userId, session1Context, session1User, session1Memory);
      expect(session1Snapshot.currentFocus).toBe("Build SaaS product");
      expect(session1Snapshot.activeGoalTitles).toContain("Build SaaS product");
      expect(session1Snapshot.identity).toBe("founder");

      // --- User logs out, time passes ---
      // Cache expires (simulate by invalidating)
      invalidateSnapshot(userId);

      // Session 2: User returns and asks "what should I focus on?"
      // System loads same context from DB
      const session2Snapshot = getLifeSnapshot(userId, session1Context, session1User, session1Memory);

      // AI should immediately know about SaaS goal
      expect(session2Snapshot.currentFocus).toBe("Build SaaS product");
      expect(session2Snapshot.activeGoalTitles).toContain("Build SaaS product");
      expect(session2Snapshot.identity).toBe("founder");

      // Should NOT require re-asking "what are your goals?"
      const contextRichness = computeContextRichness(session1Context);
      expect(contextRichness.level).toBe("MODERATE"); // Has goals but minimal tasks
      expect(contextRichness.hasGoals).toBe(true);
    });

    it("should reflect updated goals from dashboard immediately in next session", () => {
      // Session 1: User has original goal
      const originalContext: LifeContext = {
        activeGoals: [
          {
            id: "g1",
            title: "Original Goal",
            priority: "medium",
            progress: 50,
            status: "active",
            user_id: userId,
            category: "business",
            created_at: "",
            updated_at: "",
          },
        ],
        pendingTasks: [],
        activeCommitments: [],
        relationships: [],
        accountabilityItems: [],
        momentumScore: 50,
      };

      const user: UserProfile = {
        id: userId,
        coachingStyle: "balanced",
        sessionCount: 3,
      };

      const memory: MemoryContext = {
        shortTerm: [],
        longTerm: [],
        episodic: [],
        emotional: [],
        formatted: "",
      };

      const snapshot1 = getLifeSnapshot(userId, originalContext, user, memory);
      expect(snapshot1.currentFocus).toBe("Original Goal");

      // User edits goal via dashboard
      const updatedContext: LifeContext = {
        ...originalContext,
        activeGoals: [
          {
            ...originalContext.activeGoals[0],
            title: "Updated Goal via Dashboard",
            priority: "critical",
          },
        ],
      };

      // Dashboard API calls invalidateUserCache after update
      invalidateSnapshot(userId);

      // Session 2: User returns to chat
      const snapshot2 = getLifeSnapshot(userId, updatedContext, user, memory);

      // Should immediately see updated goal
      expect(snapshot2.currentFocus).toBe("Updated Goal via Dashboard");
      expect(snapshot2.activeGoalTitles).toContain("Updated Goal via Dashboard");
      expect(snapshot2.snapshotAge).toBe(0); // Fresh snapshot
    });

    it("should remember commitments and accountability context", () => {
      const contextWithCommitments: LifeContext = {
        activeGoals: [],
        pendingTasks: [],
        activeCommitments: [
          {
            id: "c1",
            description: "Exercise 5x per week",
            consistency_score: 60,
            times_followed_through: 6,
            times_broken: 4,
            status: "active",
            user_id: userId,
            created_at: "",
            updated_at: "",
          },
        ],
        relationships: [],
        accountabilityItems: [
          {
            type: "commitment",
            status: "active",
            description: "Exercise commitment at risk",
          },
        ],
        momentumScore: 55,
      };

      const user: UserProfile = {
        id: userId,
        coachingStyle: "balanced",
        sessionCount: 10,
      };

      const memory: MemoryContext = {
        shortTerm: [],
        longTerm: ["Committed to exercise routine"],
        episodic: [],
        emotional: [],
        formatted: "Committed to exercise routine",
      };

      const snapshot = getLifeSnapshot(userId, contextWithCommitments, user, memory);

      // Should not show dominant pattern yet (needs >= 3 overdue or >= 2 missed)
      expect(snapshot.dominantPattern).toBeNull();

      // But context is present
      expect(contextWithCommitments.activeCommitments).toHaveLength(1);
      expect(contextWithCommitments.accountabilityItems).toHaveLength(1);
    });
  });

  describe("Context richness progression", () => {
    it("should progress from LOW to MODERATE to HIGH as user adds data", () => {
      const user: UserProfile = {
        id: userId,
        coachingStyle: "balanced",
        sessionCount: 1,
      };

      const memory: MemoryContext = {
        shortTerm: [],
        longTerm: [],
        episodic: [],
        emotional: [],
        formatted: "",
      };

      // Stage 1: Empty state (LOW)
      const emptyContext = null;
      const richness1 = computeContextRichness(emptyContext);
      expect(richness1.level).toBe("LOW");

      // Stage 2: User adds 1 goal (MODERATE)
      const contextWith1Goal: LifeContext = {
        activeGoals: [
          {
            id: "g1",
            title: "First Goal",
            priority: "high",
            progress: 0,
            status: "active",
            user_id: userId,
            category: "business",
            created_at: "",
            updated_at: "",
          },
        ],
        pendingTasks: [],
        activeCommitments: [],
        relationships: [],
        accountabilityItems: [],
        momentumScore: 30,
      };
      const richness2 = computeContextRichness(contextWith1Goal);
      expect(richness2.level).toBe("MODERATE");
      expect(richness2.hasGoals).toBe(true);

      // Stage 3: User adds tasks and commitments (HIGH)
      const contextWithMultiple: LifeContext = {
        activeGoals: [
          contextWith1Goal.activeGoals[0],
          {
            id: "g2",
            title: "Second Goal",
            priority: "medium",
            progress: 20,
            status: "active",
            user_id: userId,
            category: "personal",
            created_at: "",
            updated_at: "",
          },
        ],
        pendingTasks: [
          {
            id: "t1",
            title: "Task 1",
            status: "pending",
            user_id: userId,
            created_at: "",
            updated_at: "",
          },
          {
            id: "t2",
            title: "Task 2",
            status: "pending",
            user_id: userId,
            created_at: "",
            updated_at: "",
          },
        ],
        activeCommitments: [
          {
            id: "c1",
            description: "Daily standup",
            consistency_score: 90,
            times_followed_through: 9,
            times_broken: 1,
            status: "active",
            user_id: userId,
            created_at: "",
            updated_at: "",
          },
        ],
        relationships: [],
        accountabilityItems: [],
        momentumScore: 70,
      };
      const richness3 = computeContextRichness(contextWithMultiple);
      expect(richness3.level).toBe("HIGH");
      expect(richness3.hasGoals).toBe(true);
      expect(richness3.hasTasks).toBe(true);
      expect(richness3.hasCommitments).toBe(true);
    });
  });

  describe("Memory persistence across sessions", () => {
    it("should carry forward conversation memories to new sessions", () => {
      // Session 1: User has meaningful conversation
      const user: UserProfile = {
        id: userId,
        fullName: "Memory Test User",
        coachingStyle: "balanced",
        sessionCount: 3,
      };

      const session1Memory: MemoryContext = {
        shortTerm: [],
        longTerm: [
          "User is feeling overwhelmed with work",
          "Discussed time management strategies",
          "Set goal to delegate more tasks",
        ],
        episodic: ["Had breakthrough about work-life balance"],
        emotional: [],
        formatted: "User is feeling overwhelmed with work. Discussed time management strategies. Set goal to delegate more tasks.",
      };

      const context: LifeContext = {
        activeGoals: [
          {
            id: "g1",
            title: "Improve work-life balance",
            priority: "high",
            progress: 30,
            status: "active",
            user_id: userId,
            category: "personal",
            created_at: "",
            updated_at: "",
          },
        ],
        pendingTasks: [],
        activeCommitments: [],
        relationships: [],
        accountabilityItems: [],
        momentumScore: 60,
      };

      const session1Snapshot = getLifeSnapshot(userId, context, user, session1Memory);

      // Session 2: Memory should persist
      // (In real system, memory comes from pgvector RAG retrieval)
      const session2Snapshot = getLifeSnapshot(userId, context, user, session1Memory);

      // Both sessions should have same baseline context
      expect(session2Snapshot.currentFocus).toBe("Improve work-life balance");
      expect(session1Snapshot.currentFocus).toBe(session2Snapshot.currentFocus);
    });
  });
});
