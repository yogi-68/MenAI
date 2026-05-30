import type { Message } from "@/lib/store";
import { CHAT_INITIAL_LIMIT, CHAT_PAGE_SIZE } from "@/lib/chat/constants";

export class ConversationNotFoundError extends Error {
  code = "NOT_FOUND" as const;
  constructor(public conversationId: string) {
    super("Conversation not found");
    this.name = "ConversationNotFoundError";
  }
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  nextBefore: string | null;
}

function mapRow(m: Record<string, string>): Message {
  return {
    id: m.id,
    role: m.role as Message["role"],
    content: m.content,
    created_at: m.created_at,
  };
}

export async function fetchMessagePage(
  convId: string,
  options?: { before?: string | null; limit?: number }
): Promise<MessagePage> {
  const limit = options?.limit ?? CHAT_INITIAL_LIMIT;
  const params = new URLSearchParams({ limit: String(limit) });
  if (options?.before) params.set("before", options.before);

  const res = await fetch(`/api/conversations/${convId}?${params.toString()}`);
  if (res.status === 404) throw new ConversationNotFoundError(convId);
  if (!res.ok) throw new Error("Failed to load messages");

  const data = await res.json();
  return {
    messages: (data.messages || []).map(mapRow),
    hasMore: Boolean(data.hasMore),
    nextBefore: data.nextBefore ?? null,
  };
}

export async function fetchLatestMessages(
  convId: string,
  limit = CHAT_INITIAL_LIMIT
): Promise<MessagePage> {
  return fetchMessagePage(convId, { limit });
}

export async function fetchOlderMessages(
  convId: string,
  before: string,
  limit = CHAT_PAGE_SIZE
): Promise<MessagePage> {
  return fetchMessagePage(convId, { before, limit });
}
