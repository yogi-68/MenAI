import type { UserModel } from "@/lib/user-model/types";
import {
  containsForbiddenClaim,
  containsPersonalityInference,
} from "@/lib/user-model/content-guard";

export interface ClaimQualityScore {
  verified: number;
  inferred: number;
  unknown: number;
  unsupported: number;
  total: number;
  percentages: {
    verified: number;
    inferred: number;
    unknown: number;
    unsupported: number;
  };
}

const UNKNOWN_PHRASES = [
  /\bisn't clear yet\b/i,
  /\bnot clear yet\b/i,
  /\btoo early to tell\b/i,
  /\benough execution history\b/i,
  /\bstill unclear\b/i,
  /\bdon't know yet\b/i,
  /\bnot enough to go on\b/i,
];

const INFERENCE_PHRASES = [
  /\bpoint(s)? (strongly )?toward\b/i,
  /\bsuggest(s)? an interest\b/i,
  /\blong-term\b/i,
  /\bappears to\b/i,
  /\blikely\b/i,
  /\bmay be\b/i,
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function matchesEvidence(sentence: string, evidence: string[]): boolean {
  const lower = sentence.toLowerCase();
  return evidence.some((e) => {
    const key = e.replace(/^Goal: "|"$/g, "").toLowerCase();
    return key.length > 4 && lower.includes(key.slice(0, Math.min(40, key.length)));
  });
}

export function scoreClaimQuality(response: string, userModel?: UserModel | null): ClaimQualityScore {
  const sentences = splitSentences(response);
  let verified = 0;
  let inferred = 0;
  let unknown = 0;
  let unsupported = 0;

  const evidence = userModel?.evidence ?? [];
  const verifiedTexts =
    userModel?.whoAmIStatements.filter((s) => s.tag === "verified").map((s) => s.text) ?? [];

  for (const sentence of sentences) {
    if (containsForbiddenClaim(sentence) || containsPersonalityInference(sentence)) {
      unsupported += 1;
      continue;
    }
    if (UNKNOWN_PHRASES.some((p) => p.test(sentence))) {
      unknown += 1;
      continue;
    }
    if (
      matchesEvidence(sentence, evidence) ||
      verifiedTexts.some((v) => {
        const words = v.toLowerCase().split(/\s+/).slice(0, 6).join(" ");
        return sentence.toLowerCase().includes(words.slice(0, 30));
      })
    ) {
      verified += 1;
      continue;
    }
    if (INFERENCE_PHRASES.some((p) => p.test(sentence))) {
      inferred += 1;
      continue;
    }
    inferred += 1;
  }

  const total = Math.max(sentences.length, 1);
  const pct = (n: number) => Math.round((n / total) * 100);

  return {
    verified,
    inferred,
    unknown,
    unsupported,
    total: sentences.length,
    percentages: {
      verified: pct(verified),
      inferred: pct(inferred),
      unknown: pct(unknown),
      unsupported: pct(unsupported),
    },
  };
}

export function aggregateClaimQuality(
  rows: Array<{ claimQuality?: ClaimQualityScore | null }>
): ClaimQualityScore {
  const sums = { verified: 0, inferred: 0, unknown: 0, unsupported: 0, total: 0 };
  for (const row of rows) {
    const q = row.claimQuality;
    if (!q) continue;
    sums.verified += q.verified;
    sums.inferred += q.inferred;
    sums.unknown += q.unknown;
    sums.unsupported += q.unsupported;
    sums.total += q.total;
  }
  const total = Math.max(sums.total, 1);
  const pct = (n: number) => Math.round((n / total) * 100);
  return {
    ...sums,
    percentages: {
      verified: pct(sums.verified),
      inferred: pct(sums.inferred),
      unknown: pct(sums.unknown),
      unsupported: pct(sums.unsupported),
    },
  };
}
