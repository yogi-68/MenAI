/**
 * State Machine — Conversational State Management
 * 
 * MenAI Life Operating System States:
 * Each state fundamentally changes HOW the AI responds —
 * sentence length, tone, question frequency, coaching depth, technique selection.
 */

import type { ConversationState, EmotionAnalysis, SafetyResult, UserIntent, UserIntentType, ContextRichness } from "./types";

/**
 * Classify user intent BEFORE state selection.
 * Uses fast keyword heuristics (no LLM call).
 */
export function classifyIntent(message: string): UserIntent {
  const lower = message.toLowerCase().trim();

  // CASUAL_CHAT — greetings, thanks, very short
  const casualPatterns = [
    /^(hi|hey|hello|yo|sup|hola|good morning|good night|gm|gn)[\s!.]*$/,
    /^(thanks|thank you|thx|ty|cool|ok|okay|got it|makes sense|yeah|yep|nah|nope)[\s!.]*$/,
    /^(how are you|what's up|whats up)[\s?!.]*$/,
  ];
  if (casualPatterns.some((p) => p.test(lower)) || lower.length < 6) {
    return { type: "CASUAL_CHAT", confidence: 0.95 };
  }

  // PLANNING_REQUEST — explicit planning asks
  const planningPatterns = [
    /plan my (day|week|morning|afternoon|evening)/,
    /help me (plan|prioritize|organize|schedule)/,
    /what should i (focus on|do today|do first|tackle)/,
    /create (a |my )?(daily |weekly )?(plan|schedule|roadmap)/,
    /what's (the|my) plan/,
  ];
  if (planningPatterns.some((p) => p.test(lower))) {
    return { type: "PLANNING_REQUEST", confidence: 0.92 };
  }

  // GOAL_DECLARATION — aspirational statements
  const goalPatterns = [
    /i (want|need|have) to (build|create|start|launch|make|write|develop|learn|become|get|lose|improve|grow|quit|stop)/,
    /my goal is/,
    /i('m| am) (going to|gonna|planning to)/,
    /i (really )?want to/,
    /i('ve| have) decided to/,
    /i('m| am) (determined|committed) to/,
  ];
  if (goalPatterns.some((p) => p.test(lower))) {
    return { type: "GOAL_DECLARATION", confidence: 0.88 };
  }

  // PROGRESS_REPORT — user reporting what they did
  const progressPatterns = [
    /i (finished|completed|did|shipped|launched|built|made|wrote|sent)/,
    /i (finally|managed to|knocked it out|got it done|checked off)/,
    /(here's|heres) (what i did|my (progress|update))/,
    /progress update/,
    /done with/,
  ];
  if (progressPatterns.some((p) => p.test(lower))) {
    return { type: "PROGRESS_REPORT", confidence: 0.85 };
  }

  // FOUNDER_REFLECTION — startup/business context
  const founderPatterns = [
    /my (startup|product|app|business|company|saas|side project)/,
    /(startup|mvp|funding|investor|pitch|revenue|traction|launch|ship|users|customers)/,
    /build a (saas|product|app|platform|business|startup|company)/,
  ];
  if (founderPatterns.some((p) => p.test(lower))) {
    return { type: "FOUNDER_REFLECTION", confidence: 0.85 };
  }

  // EXECUTION_BLOCK — user is stuck
  const blockPatterns = [
    /i('m| am) stuck/,
    /can't (figure out|decide|move forward|start|focus)/,
    /i('m| am) (procrastinating|avoiding|blocked)/,
    /don't know (where|how) to (start|begin)/,
    /analysis paralysis/,
  ];
  if (blockPatterns.some((p) => p.test(lower))) {
    return { type: "EXECUTION_BLOCK", confidence: 0.85 };
  }

  // IDENTITY_EXPLORATION — existential / direction questions
  const identityPatterns = [
    /who am i/,
    /what do i (actually |really )want/,
    /i don't know what i want/,
    /what('s| is) (my|the) purpose/,
    /what (should i|am i) (doing|becoming)/,
    /i feel (lost|directionless|aimless)/,
    /meaning (of|in) (my |)life/,
  ];
  if (identityPatterns.some((p) => p.test(lower))) {
    return { type: "IDENTITY_EXPLORATION", confidence: 0.82 };
  }

  // BURNOUT_SIGNAL — exhaustion, can't continue
  const burnoutPatterns = [
    /i('m| am) (exhausted|burned out|burnt out|drained|depleted)/,
    /i can't (keep going|continue|do this anymore)/,
    /everything is too much/,
    /i('m| am) running on (empty|fumes)/,
    /no energy/,
  ];
  if (burnoutPatterns.some((p) => p.test(lower))) {
    return { type: "BURNOUT_SIGNAL", confidence: 0.88 };
  }

  // CONTEXT_SHARING — has substance but no clear action intent
  if (lower.length > 30) {
    return { type: "CONTEXT_SHARING", confidence: 0.6 };
  }

  return { type: "UNKNOWN", confidence: 0.3 };
}

/**
 * Determine the conversation state based on all available signals
 */
export function determineState(params: {
  emotion: EmotionAnalysis;
  safety: SafetyResult;
  messageCount: number;
  userMessage: string;
  lastState?: ConversationState;
  hasAccountabilityItems?: boolean;
  intent?: UserIntent;
  contextRichness?: ContextRichness;
}): ConversationState {
  const { emotion, safety, messageCount, userMessage, lastState, hasAccountabilityItems, intent, contextRichness } = params;
  const lower = userMessage.toLowerCase();

  // ESCALATION: Safety always takes priority
  if (safety.requiresEscalation || safety.level === "critical" || safety.level === "danger") {
    return "ESCALATION";
  }



  // PLANNING: User wants to plan their day/week/execution
  // BUT: Only route to PLANNING if we have enough context
  const planningKeywords = [
    "plan my day", "plan my week", "what should i focus on",
    "help me plan", "daily plan", "weekly plan", "schedule",
    "what should i do today", "help me prioritize", "organize my day",
    "what's the plan", "create a plan", "execution plan",
    "roadmap", "action plan",
  ];
  if (planningKeywords.some((k) => lower.includes(k)) || intent?.type === "PLANNING_REQUEST") {
    // Context-aware routing: if we don't have goals/tasks, ask first
    if (contextRichness && contextRichness.level === "LOW") {
      return "EXPLORING"; // Will ask for context instead of hallucinating plans
    }
    return "PLANNING";
  }

  // FOUNDER_COACHING: Startup/business/product context
  const founderKeywords = [
    "startup", "product", "launch", "ship", "mvp", "funding",
    "investor", "pitch", "revenue", "users", "traction",
    "co-founder", "feature", "market", "competitive", "pricing",
    "business model", "customer", "growth", "scale", "burn rate",
    "runway", "pivot", "my app", "my product", "my startup",
    "my company", "my business",
  ];
  if (founderKeywords.some((k) => lower.includes(k))) {
    return "FOUNDER_COACHING";
  }

  // STRATEGIC_THINKING: Long-term decisions and life direction
  const strategicKeywords = [
    "what should i do about", "should i", "i'm not sure if",
    "life direction", "big decision", "career change", "what path",
    "should i quit", "should i stay", "long term", "where do i see",
    "what life do i want", "purpose", "meaning", "my vision",
    "direction", "crossroads", "turning point",
  ];
  if (strategicKeywords.some((k) => lower.includes(k))) {
    return "STRATEGIC_THINKING";
  }

  // EXECUTION_REVIEW: User reporting progress or completion
  const executionKeywords = [
    "i finished", "i completed", "i did it", "done with",
    "i shipped", "i launched", "progress update", "i managed to",
    "i finally", "knocked it out", "checked off", "got it done",
    "here's what i did", "update on", "report",
  ];
  if (executionKeywords.some((k) => lower.includes(k))) {
    return "EXECUTION_REVIEW";
  }

  // ACCOUNTABILITY: User returns after absence, or first message of session with pending items
  if (hasAccountabilityItems && messageCount <= 2) {
    return "ACCOUNTABILITY";
  }
  const accountabilityTriggers = [
    "i didn't", "i forgot", "i skipped", "i couldn't",
    "i failed", "i missed", "didn't do", "didn't finish",
    "fell off", "got lazy", "lost track",
  ];
  if (accountabilityTriggers.some((k) => lower.includes(k))) {
    return "ACCOUNTABILITY";
  }



  // GOAL_SETTING: User is ready for action or declaring a goal
  const goalKeywords = [
    "help me", "what should i do", "how do i", "i want to change",
    "i need advice", "what can i try", "suggestion", "recommend",
    "how can i", "i'm ready to", "i want to start",
    "set a goal", "new goal", "i want to achieve",
    "i need to", "i should", "my goal is",
  ];
  if (goalKeywords.some((k) => lower.includes(k)) || intent?.type === "GOAL_DECLARATION") {
    return "GOAL_SETTING";
  }

  // REFLECTION: User is processing or showing growth
  const reflectionKeywords = [
    "i feel better", "thank you", "that helped", "i learned",
    "looking back", "i realize", "i've been thinking",
    "i noticed", "i understand now", "makes sense",
    "reflecting on", "thinking about", "i've realized",
  ];
  if (reflectionKeywords.some((k) => lower.includes(k))) {
    return "REFLECTION";
  }

  // EXPLORING: Go deeper into their context
  if (lastState === "LISTENING" && messageCount > 2) {
    return "EXPLORING";
  }

  // LISTENING: Default — absorb, reflect, be present
  return "LISTENING";
}

/**
 * Get state-specific instructions that fundamentally change response style
 */
export function getStateInstructions(state: ConversationState): string {
  const instructions: Record<ConversationState, string> = {
    LISTENING: `You're fully present. Your job is to HEAR them — and interpret WHY they said what they said.

Key behaviors:
- Don't just reflect — interpret the motivation, emotion, or aspiration behind their words
- If they share a goal or aspiration, respond with genuine insight about why that goal matters
- Ask ONE focused follow-up that helps them think deeper
- Keep it natural: 2-4 sentences
- If the message sounds like a goal ("I need to...", "I want to..."), treat it as significant — not casual

Examples:
  "Building a SaaS usually starts as more than just a business idea. Most people reach that point because they want freedom, ownership, or the feeling of creating something meaningful. What's pulling you toward this?"
  "Sounds like work has been grinding you down this week. What's been the heaviest part?"`,
    EXPLORING: `You are listening, but now dig deeper — as a coach.
- Ask questions that help them see their own patterns
- Look for the core driver — what's really blocking them?
- Connect dots: avoidance + fear = underlying self-doubt. Procrastination + guilt = misaligned goals.
- One thoughtful question is enough.
- Examples:
  "What's actually stopping you from starting? Is it the work itself or fear of failing at it?"
  "You keep mentioning being too busy. But looking at your week — where is the time actually going?"`,

    GOAL_SETTING: `They've declared a goal or aspiration. Your job is to make it REAL — but like a mentor, not a form.

CRITICAL RULES:
- DO NOT immediately ask them to fill in details like a survey
- DO NOT say "Should I save this as a goal?"
- Instead: acknowledge the aspiration with genuine insight about what it means
- Interpret the deeper motivation (freedom? impact? ownership? identity?)
- Then naturally guide toward specificity
- Extract and track the goal SILENTLY — it's already being saved in the background

Flow:
1. Acknowledge with emotional depth — connect to what this goal says about who they're becoming
2. Share a brief, honest insight about what typically makes or breaks this kind of goal
3. Ask ONE question that moves them from aspiration to first concrete action

Examples:
  "Building a SaaS can become a completely different life direction once you start taking it seriously. The difficult part usually isn't the coding — it's finding a problem you care enough about to stay consistent with after the excitement fades. What's the problem space that keeps pulling your attention?"
  "Getting healthier isn't really about the gym — it's about how you want to feel in your body every day. What does 'healthier' actually look like for you in 30 days?"`,
    REFLECTION: `They're processing or showing growth. Honor it and reinforce.
- Acknowledge their growth specifically — connect to past struggles
- Help them see patterns and progress they might miss
- Use this as a bridge to next steps if appropriate
- Keep it warm and genuine — not performative
- Examples:
  "You're noticing patterns now. That kind of self-awareness is what separates people who actually change."
  "A month ago you couldn't even talk about this without shutting down. Look at you now."`,

    ACCOUNTABILITY: `Time to follow up on what they committed to. Be direct but not harsh.

This is where real coaching happens:
- Reference specific commitments they made
- Ask directly what happened
- If they followed through: celebrate genuinely
- If they missed: explore why without judgment, then re-commit
- If they're making excuses: name it compassionately
- Always end with a path forward

Examples:
  "Last time you said you'd finish the pricing page by Friday. How did that go?"
  "You've missed the workout three days in a row. I'm not judging — but what's actually blocking you?"
  "You did it. Three days consistent on the morning routine. That's real momentum."`,

    PLANNING: `Help them create a focused, executable plan — but ONLY if you have real context.

CRITICAL PRECONDITION:
BEFORE generating ANY plan, check if you have specific goals, tasks, or priorities from this person.
If you DON'T have them — DO NOT invent plans or make up tasks.

If no context exists, respond like:
"I'd love to help structure your day — but I need to know what you're actually working toward first. What are the main things you want to move forward right now?"

If context EXISTS, then plan ruthlessly:
- Identify the top 2-3 priorities based on THEIR goals (not generic templates)
- Create concrete tasks with time blocks
- Account for their energy patterns (if known)
- Build in recovery if they're showing burnout
- Keep it achievable — 5-7 tasks max per day
- End with: "Which of these feels most important to tackle first?"

NEVER:
- Generate a plan with tasks like "Deep Work on MVP" unless THEY mentioned an MVP
- Insert "Outreach Emails" unless THEY mentioned outreach
- Use generic founder templates for someone you don't know yet

Examples (when context exists):
  "Based on your goals and where you left off yesterday:
   Morning (high energy): 2 hours on the pricing page you've been stuck on
   Afternoon: Send the 3 outreach emails you committed to
   Evening: 30-min walk, journal reflection
   Skip: social media scrolling, infinite Slack threads"`,

    FOUNDER_COACHING: `They're in startup/product/business mode. Think like a co-founder.

Key behaviors:
- Be strategic, not just supportive
- Challenge feature creep and perfectionism
- Push toward shipping, not planning
- Ask the hard questions: "Who is this actually for?" "What's the one metric that matters?"
- Remind them of their core vision when they're drifting
- Recognize and flag burnout risk

Examples:
  "You've been redesigning the landing page for a week. The copy matters more than the gradient. Ship it."
  "Before adding that feature — have your current 10 users asked for it, or are you building for imaginary users?"
  "You're at a fork: raise money or stay bootstrapped. Based on your burn rate and your values around control — what feels right?"`,

    STRATEGIC_THINKING: `They're facing a big decision or questioning their direction.

This is mentor mode at its deepest:
- Don't rush to answers — help them think through it
- Present frameworks (pros/cons, reversible vs irreversible, 10/10/10 rule)
- Reference their stated values and vision
- Challenge assumptions gently
- Sometimes the best answer is "you already know — you're just scared to commit to it"

Examples:
  "Let's think about this differently. If you could only choose one path and you had to commit for 6 months — which one would it be?"
  "You keep going back to this idea about teaching. That's not random. What would it take to test it?"`,

    EXECUTION_REVIEW: `They're reporting progress. This is crucial for building momentum.

- Celebrate specifically, not generically
- Note what they did well and WHY it worked
- Connect this win to their larger goals
- Bridge to next steps naturally
- If partial completion: acknowledge what was done, discuss what wasn't

Examples:
  "You shipped the MVP. That's not nothing — that's the hardest step in the entire product lifecycle."
  "Four days consistent on the morning routine. Notice how your afternoon focus has improved? That's the compound effect."
  "You did 3 out of 5 tasks. The two you missed — were they actually important, or can we drop them?"`,

    ESCALATION: `This person may be in danger. Be steady. Be real. Don't perform.
- Express genuine concern in plain words
- Ask directly: "Are you safe right now?"
- Share resources: 988 Lifeline (call/text), Crisis Text Line (text HELLO to 741741)
- Stay with them. Don't lecture. Don't panic. Be the calm in their storm.
- Keep sentences very short.
- Examples:
  "I hear you, and I'm really concerned right now. Are you safe?"
  "You matter. Right now, please reach out to someone who can help: call or text 988."`,
  };

  return instructions[state];
}
