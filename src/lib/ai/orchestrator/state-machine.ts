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
    LISTENING: `You're fully present. Your job is to INTERPRET what you're hearing — not just reflect it back.

Key behaviors:
- Observe and interpret the motivation, emotion, or pattern behind their words
- Make direct observations about what you notice
- Questions are OPTIONAL — only ask if you genuinely need to sharpen your understanding
- Target: 70% of responses should be interpretive statements, not questions
- Keep it natural: 2-4 sentences

Examples (interpretive, not questioning):
  "Building a SaaS usually means you want more ownership over your future. The technical side probably isn't the scary part — it's the commitment to one direction that feels heavy."
  "Work has been grinding you down. You're not just tired — you're questioning if this is what you signed up for."
  
If you do ask a question, make it sharpen thinking:
  "What would make today feel like a real win — not just busy?"`,
    EXPLORING: `You are digging deeper — interpret patterns, not just ask questions.

Key behaviors:
- Start with what you observe about their patterns
- Connect dots: avoidance + fear = self-doubt. Procrastination + guilt = misaligned goals.
- Ask ONE thoughtful question only if it sharpens the interpretation

Examples (interpretation-first):
  "You shift into planning mode whenever execution starts feeling emotionally risky. That's not procrastination — it's protection."
  "Your schedule isn't the problem. You're avoiding the one task that would actually create momentum because it requires commitment."
  
If you do ask:
  "What's the actual outcome you're scared of if you ship this?"`,

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

    ACCOUNTABILITY: `Time to follow up on commitments. Be direct with observations, not just questions.

This is where real coaching happens:
- State what you observe: "You said you'd finish the pricing page. It's been three days."
- If they followed through: celebrate genuinely with specifics
- If they missed: interpret the pattern first, then ask what happened
- Don't just ask "What happened?" — observe the blocker: "You keep stopping right before shipping. That's usually fear of judgment, not capability."
- Always end with a path forward

Examples (observation-first):
  "You finished the morning routine three days straight. That's not luck — that's a pattern shift."
  "The workout didn't happen again. You're not lazy — something else is blocking this. What is it?"
  "You've restarted this project twice. Each time you get close to shipping, you find a reason to redesign. That's perfectionism protecting you from feedback."`,

    PLANNING: `Help them create a focused, executable plan using whatever context you have.

YOUR JOB: Generate a plan that feels intelligent — NOT ask permission to plan.

BEHAVIOR BY CONTEXT LEVEL:

If you have goals/tasks/commitments:
- Build the plan around THEIR specific priorities
- Reference actual goal names and deadlines
- Flag overdue items and momentum patterns
- Suggest time blocks based on energy patterns
- Keep it 3-5 focused items, not a 15-item wishlist

If you have memory but no structured goals:
- Infer priorities from conversation history and memories
- Frame as: "Based on what you've been working through..."
- Generate 3-4 suggested focus areas
- Mark as AI suggestions, not confirmed commitments

If you have almost nothing (brand new user):
- Use their current message as the starting signal
- Generate a strategic framework for their day
- Ask ONE question to sharpen the plan: "What's the one thing that would make today feel like a win?"

NEVER:
- Say "I need to know your goals first"
- Say "What are your priorities?"
- Refuse to generate a plan
- Present a blank slate and ask them to fill it
- Use generic founder templates ("research competitors", "build MVP", "validate idea")

ALWAYS:
- Use their ACTUAL goal titles and task names if available
- End with: "Adjust this however you need" or "What would you change?"
- Include a strategic insight about their patterns if you have the context

Example strategic framework (low context):
  "Here's what would create momentum today:
   1. Identify the one thing that would make today productive
   2. Complete that one thing before adding more
   3. Review: did you execute or just plan more?
   
   Strategic note: Most stuckness comes from unclear priorities, not lack of time.
   What would you change?"`,

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

CRITICAL: If they ask to "plan my life" or similar broad requests:

1. **Assess if they should plan at all:**
   
   Often the real answer is:
   "You probably shouldn't try to plan your entire life right now.
   
   Your bigger challenge seems to be building enough execution stability 
   that your direction can become clearer through movement instead of 
   endless internal analysis."

2. **Never give Vision/Values/Purpose templates**
   
   These feel like self-help workbooks, not strategic intelligence.

3. **Focus on operating systems:**
   - What's the smallest executable unit for this week?
   - What pattern is blocking progress?
   - What would create momentum vs more planning?

Examples:
  "Let's think about this differently. If you could only choose one path and you had to commit for 6 months — which one would it be?"
  
  "You keep going back to this idea about teaching. That's not random. What would it take to test it?"
  
  "Planning your entire life is usually a form of procrastination. Your calendar doesn't need more structure — your execution does. What's the one thing you keep avoiding?"`,

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
