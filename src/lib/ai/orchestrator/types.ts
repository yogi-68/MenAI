/**
 * AI Orchestrator Types
 * Shared type definitions for the MenAI Life Operating System pipeline
 */

// ===== Conversation States =====
export type ConversationState =
  | "LISTENING"           // Absorbing what the user says
  | "VALIDATING"          // Acknowledging and validating feelings
  | "EXPLORING"           // Asking clarifying questions
  | "REFRAMING"           // Gently reframing negative thoughts
  | "GROUNDING"           // Grounding exercises for anxiety/panic
  | "GOAL_SETTING"        // Helping set small actionable goals
  | "REFLECTION"          // Reflecting on progress/patterns
  | "EMOTIONAL_HOLDING"   // Emotional silence — just hold space, no questions
  | "ACCOUNTABILITY"      // Following up on commitments and promises
  | "PLANNING"            // Creating daily/weekly execution plans
  | "FOUNDER_COACHING"    // Startup/business strategic coaching
  | "STRATEGIC_THINKING"  // Long-term decisions and life direction
  | "EXECUTION_REVIEW"    // Reviewing progress and adapting plans
  | "ESCALATION";         // Crisis mode — safety first

// ===== LLM Tiers =====
export type ModelTier = "cheap" | "standard" | "premium";

export interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  tier: ModelTier;
}

// ===== Emotion =====
export interface EmotionAnalysis {
  primaryEmotion: string;
  intensity: number;          // 1-10
  secondaryEmotions: string[];
  sentiment: "positive" | "negative" | "neutral";
  needsSupport: boolean;
  valence: number;            // -1 to 1
}

// ===== Memory Types =====
export type MemoryType =
  | "conversation"
  | "insight"
  | "preference"
  | "mood"
  | "journal"
  | "goal"
  | "commitment"
  | "relationship"
  | "behavioral"
  | "identity";

export interface MemoryEntry {
  id?: string;
  userId: string;
  content: string;
  memoryType: MemoryType;
  importance: number;         // 0-1 score
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt?: string;
}

export interface MemoryContext {
  shortTerm: string[];        // Recent messages
  longTerm: string[];         // Semantic summaries
  episodic: string[];         // Important events
  emotional: string[];        // Mood evolution
  formatted: string;          // Ready for prompt injection
}

// ===== Life Data (Extracted from Conversations) =====
export interface ExtractedLifeData {
  goals: ExtractedGoal[];
  commitments: ExtractedCommitment[];
  relationships: ExtractedRelationship[];
  habits: ExtractedHabit[];
  emotions: ExtractedEmotion[];
  projects: ExtractedProject[];
  blockers: string[];
}

export interface ExtractedGoal {
  title: string;
  category: GoalCategory;
  priority: "low" | "medium" | "high" | "critical";
  description?: string;
  targetDate?: string;
}

export interface ExtractedCommitment {
  description: string;
  category: "health" | "work" | "relationships" | "personal" | "other";
  timeframe?: string; // "today", "this week", "ongoing"
}

export interface ExtractedRelationship {
  name: string;
  role: "partner" | "parent" | "friend" | "mentor" | "coworker" | "other";
  context?: string; // what was said about them
}

export interface ExtractedHabit {
  name: string;
  type: "sleep" | "workout" | "nutrition" | "deep_work" | "reading" | "learning" | "social_media" | "other";
  status: "positive" | "negative" | "neutral"; // is user doing well or struggling
}

export interface ExtractedEmotion {
  emotion: string;
  intensity: number;
  trigger?: string;
}

export interface ExtractedProject {
  name: string;
  status: "active" | "stuck" | "completed" | "idea";
  context?: string;
}

export type GoalCategory =
  | "startup"
  | "fitness"
  | "financial"
  | "relationship"
  | "learning"
  | "identity"
  | "health"
  | "career"
  | "other";

// ===== Structured Life Data =====
export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: GoalCategory;
  status: "active" | "completed" | "paused" | "abandoned";
  priority: "low" | "medium" | "high" | "critical";
  targetDate?: string;
  progress: number; // 0-100
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  goalId?: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  dueDate?: string;
  scheduledTime?: string;
  recurrence?: "daily" | "weekly" | "weekdays" | null;
  streakCount: number;
  lastCompletedAt?: string;
  createdAt: string;
}

export interface Commitment {
  id: string;
  userId: string;
  description: string;
  category: "health" | "work" | "relationships" | "personal" | "other";
  status: "active" | "completed" | "abandoned";
  consistencyScore: number;
  timesFollowedThrough: number;
  timesBroken: number;
  createdAt: string;
}

export interface Relationship {
  id: string;
  userId: string;
  name: string;
  role: string;
  emotionalCloseness?: number;
  notes?: string;
  lastMentionedAt?: string;
}

export interface DailyPlan {
  id: string;
  userId: string;
  planDate: string;
  planContent: {
    focusAreas: string[];
    tasks: Array<{ title: string; priority: string; timeBlock?: string; completed?: boolean }>;
    aiInsight: string;
  };
  aiNotes?: string;
  completionScore?: number;
  energyLevel?: number;
}

// ===== Life Context (for prompt injection) =====
export interface LifeContext {
  activeGoals: Goal[];
  pendingTasks: Task[];
  activeCommitments: Commitment[];
  recentRelationships: Relationship[];
  todaysPlan?: DailyPlan;
  accountabilityItems: AccountabilityItem[];
  momentumScore: number; // 0-100
}

export interface AccountabilityItem {
  type: "commitment" | "task";
  description: string;
  status: "pending" | "overdue" | "missed";
  dueDate?: string;
  daysOverdue?: number;
}

// ===== Safety =====
export type SafetyLevel = "safe" | "caution" | "warning" | "danger" | "critical";

export interface SafetyResult {
  level: SafetyLevel;
  categories: string[];
  confidence: number;
  requiresEscalation: boolean;
  moderationFlagged: boolean;
  crisisResponse?: string;
  resources: EmergencyResource[];
}

export interface EmergencyResource {
  name: string;
  phone: string;
  text?: string;
  url?: string;
  available: string;
}

// ===== User Profile =====
export interface UserProfile {
  id: string;
  fullName?: string;
  therapyGoals?: string[];
  vision?: string;
  founderMode?: boolean;
  coachingStyle?: "balanced" | "push" | "gentle" | "strategic";
  preferredTone?: "warm" | "direct" | "gentle" | "professional";
  anxietyTriggers?: string[];
  copingPreferences?: string[];
  sessionCount: number;
  lastEmotionalState?: string;
}

// ===== Orchestrator Pipeline =====
export interface OrchestratorInput {
  userId: string;
  message: string;
  conversationId?: string | null;
}

export interface OrchestratorOutput {
  response: string;
  conversationId: string;
  crisis: boolean;
  crisisLevel?: string;
  emotion?: EmotionAnalysis | null;
  state: ConversationState;
  modelUsed: string;
  tokensUsed: number;
  resources?: EmergencyResource[];
  extractedData?: ExtractedLifeData;
}

// ===== Pipeline Context (passed between engines) =====
export interface PipelineContext {
  input: OrchestratorInput;
  user: UserProfile;
  safety: SafetyResult;
  emotion: EmotionAnalysis;
  memory: MemoryContext;
  lifeContext?: LifeContext;
  state: ConversationState;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId: string;
  modelConfig: ModelConfig;
}
