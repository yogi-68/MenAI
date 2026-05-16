/**
 * Response Validator — Output safety and quality checks
 * Ensures AI responses are safe, appropriate, and helpful
 */

/**
 * Validate and clean the AI response before sending to user
 */
export function validateResponse(
  response: string,
  context: { crisisMode: boolean; emotionIntensity: number }
): {
  content: string;
  modified: boolean;
  flags: string[];
} {
  const flags: string[] = [];
  let content = response;
  let modified = false;

  // === Check 1: Response not empty ===
  if (!content || content.trim().length === 0) {
    content = "I'm here for you. Could you tell me more about how you're feeling?";
    flags.push("empty_response_replaced");
    modified = true;
  }

  // === Check 2: No diagnosis language ===
  const diagnosisPatterns = [
    /you (have|suffer from|are diagnosed with) (depression|anxiety|bipolar|ptsd|ocd|adhd|bpd|schizophrenia)/gi,
    /your (diagnosis|condition) is/gi,
    /I('m| am) diagnosing you/gi,
  ];
  for (const pattern of diagnosisPatterns) {
    if (pattern.test(content)) {
      flags.push("diagnosis_language_detected");
      // Don't remove — just flag. The system prompt should prevent this.
    }
  }

  // === Check 3: No medication advice ===
  const medPatterns = [
    /you should (take|try|start|stop|increase|decrease) (medication|pills|drugs|dosage)/gi,
    /I (recommend|suggest|prescribe) (medication|pills)/gi,
    /take \d+\s*(mg|milligrams)/gi,
  ];
  for (const pattern of medPatterns) {
    if (pattern.test(content)) {
      flags.push("medication_advice_detected");
    }
  }

  // === Check 4: No claiming to be human ===
  const humanClaims = [
    /I('m| am) a (therapist|doctor|psychologist|psychiatrist|counselor|human)/gi,
    /as a (therapist|doctor|medical professional)/gi,
  ];
  for (const pattern of humanClaims) {
    if (pattern.test(content)) {
      flags.push("human_claim_detected");
    }
  }

  // === Check 5: Response not too long (trim if needed) ===
  if (content.length > 2000) {
    const sentences = content.split(/[.!?]+/).filter(Boolean);
    content = sentences.slice(0, 8).join(". ").trim() + ".";
    flags.push("response_trimmed");
    modified = true;
  }

  // === Check 6: Response not dismissive during crisis ===
  if (context.crisisMode) {
    const dismissivePatterns = [
      /just (relax|calm down|think positive|cheer up|get over it)/gi,
      /it('s| is) (not that bad|no big deal|nothing)/gi,
      /at least/gi,
    ];
    for (const pattern of dismissivePatterns) {
      if (pattern.test(content)) {
        flags.push("dismissive_during_crisis");
      }
    }
  }

  return { content, modified, flags };
}
