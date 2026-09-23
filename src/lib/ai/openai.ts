import OpenAI from "openai";
import {  EMBEDDING_MODEL, MODERATION_MODEL } from "@/lib/ai/models";

/** Upper bound on any single model call. Below the 60s route budget so that a
 *  hung provider connection surfaces as an error we can handle rather than as
 *  a function timeout. */
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 45_000);

/** The SDK retries idempotent failures (429, 5xx, connection errors). */
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 2);

// Lazy-init singleton to avoid build-time credential errors
let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "placeholder",
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return _openai;
}

// Model ids live in models.ts so that pricing and routing see the same values.
export { EMBEDDING_MODEL, MODERATION_MODEL };

// Generate embeddings for text
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

// Check content safety via OpenAI moderation
export async function moderateContent(text: string) {
  const openai = getOpenAI();
  const response = await openai.moderations.create({
    model: MODERATION_MODEL,
    input: text,
  });
  return response.results[0];
}
