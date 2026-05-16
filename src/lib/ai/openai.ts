import OpenAI from "openai";

// Lazy-init singleton to avoid build-time credential errors
let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "placeholder",
    });
  }
  return _openai;
}

// Models
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4o";
export const MODERATION_MODEL = "omni-moderation-latest";

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
