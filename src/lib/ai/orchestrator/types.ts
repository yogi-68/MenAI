/**
 * AI Orchestrator Types
 * Shared type definitions for the MenAI Life Operating System pipeline
 */

// ===== Conversation States =====
export type ConversationState =
  | "LISTENING"           // Absorbing what the user says
  | "EXPLORING"           // Asking clarifying questions
  | "GOAL_SETTING"        // Helping set small actionable goals
  | "REFLECTION"          // Reflecting on progress/patterns
  | "ACCOUNTABILITY"      // Following up on commitments and promises
  | "PLANNING"            // Creating daily/weekly execution plans
  | "FOUNDER_COACHING"    // Startup/business strategic coaching
  | "STRATEGIC_THINKING"  // Long-term decisions and life direction
  | "EXECUTION_REVIEW"    // Reviewing progress and adapting plans
  | "ESCALATION";         // Crisis mode — safety first

// ===== User Intent (classified BEFORE state selection) =====
export type UserIntentType =
  | "GOAL_DECLARATION"       // "I want to build...", "I need to...", "My goal is..."
  | "PLANNING_REQUEST"       // "Plan my day", "Help me prioritize"
  | "PROGRESS_REPORT"        // "I finished...", "Here's what I did..."
  | "IDENTITY_EXPLORATION"   // "I don't know what I want", "Who am I becoming?"
  | "EXECUTION_BLOCK"        // "I'm stuck", "Can't figure out..."
  | "FOUNDER_REFLECTION"     // "My startup...", "My product...", business context
  | "CASUAL_CHAT"            // "Hi", "Thanks", small talk
  | "CONTEXT_SHARING"        // General life info without clear intent
  | "BURNOUT_SIGNAL"         // "I'm exhausted", "I can't keep going"
  | "UNKNOWN";               // Can't classify

export interface UserIntent {
  type: UserIntentType;
  confidence: number;        // 0-1 how certain we are about the classification
  reasoning?: string;        // brief explanation of why this intent was chosen
}

// ===== Context Richness (how much we know about this user) =====
export type ContextRichnessLevel = "LOW" | "MODERATE" | "HIGH";

export interface ContextRichness {
  score: number;             // 0-1
  level: ContextRichnessLevel;
  hasGoals: boolean;
  hasCommitments: boolean;
  hasTasks: boolean;
  hasRelationships: boolean;
}

// ===== Inference Confidence (how much to trust each context source) =====
export type InferenceType = "explicit" | "inferred" | "weakly_inferred";

export interface InferenceConfidence {
  goals: InferenceType;       // explicit if user stated goals, inferred from memory
  identity: InferenceType;    // founder/creator signals
  priorities: InferenceType;  // what matters most
  patterns: InferenceType;    // execution patterns detected
  overall: InferenceType;     // aggregate
}

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
  identitySignals: IdentitySignal[];
  executionPatterns: ExecutionPattern[];
  relationships: ExtractedRelationship[];
  habits: ExtractedHabit[];
  emotions: ExtractedEmotion[];
  projects: ExtractedProject[];
  blockers: string[];
}

export interface IdentitySignal {
  type: "founder" | "creator" | "self-discipline" | "leadership" | "other";
  description: string;
  longTermDirection: string;
  confidence: number;
  extractedFrom?: string;
}

export interface ExecutionPattern {
  pattern: "burnout" | "procrastination" | "avoidance" | "perfectionism" | "scattered_focus" | "inconsistency" | "overthinking";
  trigger?: string;
  frequency: "rare" | "occasional" | "frequent" | "constant";
  severity: "low" | "medium" | "high";
  behavioralImpact: string;
  confidence: number;
  extractedFrom?: string;
}

export interface ExtractedGoal {
  title: string;
  category: GoalCategory;
  priority: "low" | "medium" | "high" | "critical";
  description?: string;
  targetDate?: string;
  confidence: number;
}

export interface ExtractedCommitment {
  description: string;
  category: "health" | "work" | "relationships" | "personal" | "other";
  timeframe?: string; // "today", "this week", "ongoing"
  confidence: number;
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
  confidence: number;
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

// ===== Predictive Behavioral Intelligence =====
export interface BehavioralPrediction {
  id: string;
  prediction_type: "abandonment_risk" | "burnout_risk" | "momentum_collapse" | "avoidance_loop" | "motivation_spike" | "execution_drift";
  trigger_condition: string;
  predicted_behavior: string;
  status: "active" | "validated" | "invalidated";
  confidence: number; // 0-1
  created_at: string;
}

export interface WeeklyReport {
  id: string;
  report_date: string;
  period_start: string;
  period_end: string;
  report_content: {
    momentum_shift: "improving" | "declining" | "stagnant";
    key_insights: string[];
    validated_predictions: string[];
    upcoming_risks: string[];
  };
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
  identitySignals?: IdentitySignal[]; // NEW: from DB
  executionPatterns?: ExecutionPattern[]; // NEW: from DB
  activePredictions?: BehavioralPrediction[]; // NEW: from Prediction Engine
}

// ===== Life Snapshot Cache (compact user operating state) =====
export interface LifeSnapshot {
  // Stable identity (slow-changing)
  identity: string;                // "founder", "student", "executive", "creator", "unknown"
  identitySignals: IdentitySignal[]; // NEW: actual signals from DB
  persistentPatterns: ExecutionPattern[]; // NEW: established patterns
  activePredictions: BehavioralPrediction[]; // NEW: active behavioral predictions
  
  // Current state (ephemeral)
  currentFocus: string;            // Primary thing they're working on
  activeGoalTitles: string[];      // Just titles, not full objects
  topPriority: string | null;      // Single most important thing
  momentum: "rising" | "stable" | "declining" | "unknown";
  dominantPattern: string | null;  // "overplanning", "procrastination", etc.
  energyTrend: "high" | "moderate" | "low" | "unknown";
  
  // Metadata
  lastActiveAt: string;            // ISO timestamp
  snapshotAge: number;             // minutes since last update
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
  vision?: string;
  founderMode?: boolean;
  coachingStyle?: "balanced" | "push" | "gentle" | "strategic";
  preferredTone?: "warm" | "direct" | "gentle" | "professional";
  sessionCount: number;
}

// ===== UNIFIED SESSION CONTEXT (Single Source of Truth) =====
/**
 * UnifiedSessionContext is the complete operating state for a user session.
 * All AI systems should consume THIS instead of loading pieces separately.
 * 
 * This prevents:
 * - Inconsistent context between systems
 * - Missing profile data (name disappearing)
 * - Snapshot/context misalignment
 * - Multiple queries for the same data
 * 
 * CRITICAL: Load this ONCE per request, cache in Redis, invalidate on updates.
 */
export interface UnifiedSessionContext {
  // === USER IDENTITY ===
  userId: string;
  profile: {
    fullName?: string;
    vision?: string;
    founderMode: boolean;
    coachingStyle: "balanced" | "push" | "gentle" | "strategic";
  };
  
  // === OPERATING STATE (cached snapshot) ===
  lifeSnapshot: LifeSnapshot;
  
  // === STRUCTURED DATA (goals, commitments, patterns) ===
  activeGoals: Goal[];
  activeCommitments: Commitment[];
  pendingTasks: Task[];
  identitySignals: IdentitySignal[];
  executionPatterns: ExecutionPattern[];
  activePredictions: BehavioralPrediction[];
  
  // === MEMORY & CONTEXT ===
  recentInsights: string[];           // Last 3 AI-generated insights
  recentMemorySummary: string;        // Compact memory for fast retrieval
  
  // === INFERENCE CONFIDENCE ===
  inferenceConfidence: InferenceConfidence;
  contextRichness: ContextRichness;
  
  // === METADATA ===
  lastUpdated: string;                // ISO timestamp
  cacheAge: number;                   // seconds since last update
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
  lifeSnapshot?: LifeSnapshot;
  inferenceConfidence: InferenceConfidence;
  state: ConversationState;
  intent: UserIntent;
  contextRichness: ContextRichness;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId: string;
  modelConfig: ModelConfig;
}
