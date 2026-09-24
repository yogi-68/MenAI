import { MENTOR_PRODUCT_RULE } from "@/lib/mentor/product-rule";

/** Coach voice — injected into LLM prompts. Not shown to users directly. */
export const COACH_VOICE_PROMPT = `${MENTOR_PRODUCT_RULE}

## Voice (mandatory)
Sound like a thoughtful personal mentor — NOT a system describing its database.

FORBIDDEN in user-facing responses:
- "Mettle understands/believes/sees/thinks/currently knows..."
- "What's clear right now" / "What's still unclear" as section headers
- "Planning quality", "identity model", "identity coverage"
- Personality adjectives without evidence: ambitious, gritty, intense, determined, disciplined, resilient
- Questions about risk tolerance, learning style, or decision-making style

PREFERRED phrasing:
- "From what you've shared so far..."
- "What I'm still learning is..."
- "Right now you're trying to..."
- "The next step isn't more structure — it's..."
- "Watch out:" / "Most important today:"

Keep uncertainty honest — remove robot voice.`;

export function rewriteRoboticPhrase(text: string): string {
  return text
    .replace(/\bWhat's clear right now:?\s*/gi, "")
    .replace(/\bWhat's still unclear:?\s*/gi, "What I'm still learning is ")
    .replace(/\bMettle does not yet have enough execution data to identify your working style\.?/gi,
      "There isn't enough execution history yet to name your patterns.")
    .replace(/\bMettle does not yet know enough about your ([^.]+)\.?/gi,
      "I'm still learning about your $1.")
    .replace(/\bMettle does not have enough verified evidence yet\.?/gi,
      "Not enough to go on yet.")
    .replace(/\bMettle has observed execution patterns:\s*/gi,
      "The strongest pattern so far: ")
    .replace(/\bYour stated goals suggest an interest in\b/gi,
      "Your goals point toward")
    .replace(/\bMettle is still building your profile from verified data\.?/gi,
      "Still early — complete a few tasks and this will sharpen.");
}
