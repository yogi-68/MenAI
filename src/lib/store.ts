import { create } from "zustand";
import { persist, StateStorage, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

const PERSIST_DEBOUNCE_MS = 500;
const MAX_PERSISTED_CONVERSATIONS = 12;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: { name: string; value: string } | null = null;

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: (name: string, value: string): Promise<void> => {
    pendingPersist = { name, value };
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (pendingPersist) {
        void set(pendingPersist.name, pendingPersist.value);
      }
    }, PERSIST_DEBOUNCE_MS);
    return Promise.resolve();
  },
  removeItem: async (name: string): Promise<void> => {
    if (persistTimer) clearTimeout(persistTimer);
    pendingPersist = null;
    await del(name);
  },
};

export interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string;
  role: string;
  subscription_tier?: string;
  onboarding_completed: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  emotion_data?: Record<string, unknown>;
  crisis?: boolean;
}

export interface ConversationState {
  messages: Message[];
  pendingOptimisticIds: string[];
}

interface AppState {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  conversations: Conversation[];
  setConversations: (convs: Conversation[]) => void;

  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;

  conversationStates: Record<string, ConversationState>;
  clearConversationState: (conversationId: string) => void;
  migrateConversation: (fromId: string, toId: string) => void;

  setMessages: (conversationId: string, msgs: Message[]) => void;
  prependMessages: (conversationId: string, msgs: Message[]) => void;
  addMessage: (conversationId: string, msg: Message) => void;
  addOptimisticMessage: (conversationId: string, msg: Message) => void;
  reconcileMessages: (conversationId: string, serverMessages: Message[]) => void;
  clearPendingOptimistic: (conversationId: string, messageId: string) => void;

  crisisAlert: boolean;
  setCrisisAlert: (crisis: boolean) => void;

  activeView: string;
  setActiveView: (view: string) => void;
}

const defaultConversationState: ConversationState = {
  messages: [],
  pendingOptimisticIds: [],
};

/** Legacy persisted states may only have messages — always normalize before use. */
export function normalizeConversationState(
  raw: Partial<ConversationState> | undefined | null
): ConversationState {
  if (!raw) return { ...defaultConversationState };
  return {
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    pendingOptimisticIds: Array.isArray(raw.pendingOptimisticIds)
      ? raw.pendingOptimisticIds
      : [],
  };
}

function trimPersistedStates(
  states: Record<string, ConversationState>,
  currentId: string | null
): Record<string, ConversationState> {
  const normalized = Object.fromEntries(
    Object.entries(states).map(([id, cs]) => [id, normalizeConversationState(cs)])
  );
  const entries = Object.entries(normalized);
  if (entries.length <= MAX_PERSISTED_CONVERSATIONS) return normalized;

  const sorted = entries.sort((a, b) => {
    if (a[0] === currentId) return -1;
    if (b[0] === currentId) return 1;
    const aLast = a[1].messages.at(-1)?.created_at || "";
    const bLast = b[1].messages.at(-1)?.created_at || "";
    return bLast.localeCompare(aLast);
  });

  return Object.fromEntries(sorted.slice(0, MAX_PERSISTED_CONVERSATIONS));
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),

      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      conversations: [],
      setConversations: (convs) => set({ conversations: convs }),

      currentConversationId: null,
      setCurrentConversationId: (id) => set({ currentConversationId: id }),

      conversationStates: {},

      clearConversationState: (conversationId) =>
        set((state) => {
          const newStates = { ...state.conversationStates };
          delete newStates[conversationId];
          return { conversationStates: newStates };
        }),

      migrateConversation: (fromId, toId) =>
        set((state) => {
          if (fromId === toId) return state;
          const fromState = normalizeConversationState(state.conversationStates[fromId]);
          if (fromState.messages.length === 0 && fromState.pendingOptimisticIds.length === 0) {
            return { currentConversationId: toId };
          }

          const newStates = { ...state.conversationStates };
          delete newStates[fromId];
          newStates[toId] = fromState;

          return {
            conversationStates: newStates,
            currentConversationId:
              state.currentConversationId === fromId ? toId : state.currentConversationId,
          };
        }),

      setMessages: (conversationId, msgs) =>
        set((state) => ({
          conversationStates: {
            ...state.conversationStates,
            [conversationId]: {
              ...normalizeConversationState(state.conversationStates[conversationId]),
              messages: msgs,
              pendingOptimisticIds: [],
            },
          },
        })),

      prependMessages: (conversationId, older) =>
        set((state) => {
          const convState = normalizeConversationState(state.conversationStates[conversationId]);
          const existingIds = new Set(convState.messages.map((m) => m.id));
          const toAdd = older.filter((m) => !existingIds.has(m.id));
          if (toAdd.length === 0) return state;
          return {
            conversationStates: {
              ...state.conversationStates,
              [conversationId]: {
                ...convState,
                messages: [...toAdd, ...convState.messages],
              },
            },
          };
        }),

      addMessage: (conversationId, msg) =>
        set((state) => {
          const convState = normalizeConversationState(state.conversationStates[conversationId]);
          const exists = convState.messages.some((m) => m.id === msg.id);
          if (exists) return state;

          const pending = convState.pendingOptimisticIds.filter((id) => id !== msg.id);
          return {
            conversationStates: {
              ...state.conversationStates,
              [conversationId]: {
                ...convState,
                messages: [...convState.messages, msg],
                pendingOptimisticIds: pending,
              },
            },
          };
        }),

      addOptimisticMessage: (conversationId, msg) =>
        set((state) => {
          const convState = normalizeConversationState(state.conversationStates[conversationId]);
          return {
            conversationStates: {
              ...state.conversationStates,
              [conversationId]: {
                ...convState,
                messages: [...convState.messages, msg],
                pendingOptimisticIds: [...convState.pendingOptimisticIds, msg.id],
              },
            },
          };
        }),

      reconcileMessages: (conversationId, serverMessages) =>
        set((state) => {
          const existing = state.conversationStates[conversationId];
          if (!existing) {
            return {
              conversationStates: {
                ...state.conversationStates,
                [conversationId]: { messages: serverMessages, pendingOptimisticIds: [] },
              },
            };
          }

          const convState = normalizeConversationState(existing);
          const optimisticIds = new Set(convState.pendingOptimisticIds);
          const optimisticMessages = convState.messages.filter((m) => optimisticIds.has(m.id));
          const serverIds = new Set(serverMessages.map((m) => m.id));

          const merged = [
            ...serverMessages,
            ...optimisticMessages.filter((m) => !serverIds.has(m.id)),
          ].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          return {
            conversationStates: {
              ...state.conversationStates,
              [conversationId]: {
                messages: merged,
                pendingOptimisticIds: convState.pendingOptimisticIds.filter(
                  (id) => !serverIds.has(id)
                ),
              },
            },
          };
        }),

      clearPendingOptimistic: (conversationId, messageId) =>
        set((state) => {
          const existing = state.conversationStates[conversationId];
          if (!existing) return state;
          const convState = normalizeConversationState(existing);
          return {
            conversationStates: {
              ...state.conversationStates,
              [conversationId]: {
                ...convState,
                pendingOptimisticIds: convState.pendingOptimisticIds.filter(
                  (id) => id !== messageId
                ),
              },
            },
          };
        }),

      crisisAlert: false,
      setCrisisAlert: (crisis) => set({ crisisAlert: crisis }),

      activeView: "chat",
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: "menai-db-storage",
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
        conversations: state.conversations,
        conversationStates: trimPersistedStates(
          Object.fromEntries(
            Object.entries(state.conversationStates).map(([id, convState]) => {
              const normalized = normalizeConversationState(convState);
              return [
                id,
                { messages: normalized.messages.slice(-80), pendingOptimisticIds: [] },
              ];
            })
          ),
          state.currentConversationId
        ),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.conversationStates = Object.fromEntries(
          Object.entries(state.conversationStates || {}).map(([id, convState]) => [
            id,
            normalizeConversationState(convState),
          ])
        );
        if (
          state.currentConversationId?.startsWith("pending-")
        ) {
          state.currentConversationId = null;
        }
      },
    }
  )
);

/** Imperative access for async handlers (avoids stale closures). */
export function getChatStore() {
  return useAppStore.getState();
}

export function isRealConversationId(id: string | null | undefined): id is string {
  return !!id && !id.startsWith("pending-");
}
