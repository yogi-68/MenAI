/** Coach voice — injected into LLM prompts. Not shown to users directly. */
export const COACH_VOICE_PROMPT = `## Voice (mandatory)
Sound like a thoughtful coach — NOT a system describing its database.

FORBIDDEN in coaching responses:
- "MenAI understands/believes/sees/thinks/currently knows..."
- "According to available/stored/current information..."
- "Based on your profile/stored data/available information..."
- Personality adjectives without evidence: ambitious, gritty, intense, determined, disciplined, resilient

PREFERRED phrasing:
- "What's clear:" / "So far:" / "The strongest pattern so far:"
- "The biggest unknown:" / "What's still unclear:"
- "It's still too early to tell whether..."
- "There isn't enough execution history yet to..."
- "Your goals point strongly toward..."

Keep uncertainty — remove robot voice.

Exception: You may say "MenAI" ONLY when explaining what the product needs to generate plans (e.g. "To build a sharper plan, MenAI still needs your training schedule").`;

export function rewriteRoboticPhrase(text: string): string {
  return text
    .replace(/\bMenAI does not yet have enough execution data to identify your working style\.?/gi,
      "There isn't enough execution history yet to identify your working style.")
    .replace(/\bMenAI does not yet know enough about your ([^.]+)\.?/gi,
      "Your $1 isn't clear yet.")
    .replace(/\bMenAI does not have enough verified evidence yet\.?/gi,
      "Not enough to go on yet.")
    .replace(/\bMenAI has observed execution patterns:\s*/gi,
      "The strongest pattern so far: ")
    .replace(/\bYour stated goals suggest an interest in\b/gi,
      "Your goals point toward")
    .replace(/\bMenAI is still building your profile from verified data\.?/gi,
      "Still building your profile from what you've logged so far.");
}
