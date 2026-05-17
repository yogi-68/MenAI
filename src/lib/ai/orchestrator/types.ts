/**
 * AI Orchestrator Types
 * Shared type definitions for the AI pipeline
 */

// ===== Conversation States =====
export type ConversationState =
  | "LISTENING"        // Absorbing what the user says
  | "VALIDATING"       // Acknowledging and validating feelings
  | "EXPLORING"        // Asking clarifying questions
  | "REFRAMING"        // Gently reframing negative thoughts (CBT)
  | "GROUNDING"        // Grounding exercises for anxiety/panic
  | "GOAL_SETTING"     // Helping set small actionable goals
  | "REFLECTION"       // Reflecting on progress/patterns
  | "EMOTIONAL_HOLDING" // Emotional silence - just hold space, no questions
  | "ESCALATION";      // Crisis mode — safety first

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
export type MemoryType = "short_term" | "long_term" | "episodic" | "emotional";

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
}

// ===== Pipeline Context (passed between engines) =====
export interface PipelineContext {
  input: OrchestratorInput;
  user: UserProfile;
  safety: SafetyResult;
  emotion: EmotionAnalysis;
  memory: MemoryContext;
  state: ConversationState;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId: string;
  modelConfig: ModelConfig;
}
