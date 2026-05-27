import { create } from "zustand";
import { persist, StateStorage, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

// IndexedDB storage implementation for Zustand
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string;
  role: string;
  subscription_tier: string;
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
  // Streaming state - NOT persisted
  streamingContent?: string;
  isAiTyping?: boolean;
  // Track optimistic messages to prevent them from being wiped
  pendingOptimisticIds?: Set<string>;
}

interface AppState {
  // User
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Global Chat State
  conversations: Conversation[];
  setConversations: (convs: Conversation[]) => void;
  
  // Isolated Conversation States
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  
  conversationStates: Record<string, ConversationState>;
  clearConversationState: (conversationId: string) => void;
  
  // Actions for the ACTIVE conversation
  setMessages: (conversationId: string, msgs: Message[]) => void;
  addMessage: (conversationId: string, msg: Message) => void;
  addOptimisticMessage: (conversationId: string, msg: Message) => void;
  reconcileMessages: (conversationId: string, serverMessages: Message[]) => void;
  updateStreamingContent: (conversationId: string, content: string) => void;
  setIsAiTyping: (conversationId: string, typing: boolean) => void;
  
  // Legacy global alert
  crisisAlert: boolean;
  setCrisisAlert: (crisis: boolean) => void;

  // UI
  activeView: string;
  setActiveView: (view: string) => void;
}

const defaultConversationState: ConversationState = {
  messages: [],
  // Streaming state defaults
  streamingContent: "",
  isAiTyping: false,
  pendingOptimisticIds: new Set(),
};

// Separate: what gets persisted vs what's ephemeral
const persistedConversationState: ConversationState = {
  messages: [],
  // Don't persist streaming state
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // User
      user: null,
      setUser: (user) => set({ user }),

      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Global Chat State
      conversations: [],
      setConversations: (convs) => set({ conversations: convs }),

      // Isolated Conversation States
      currentConversationId: null,
      setCurrentConversationId: (id) => set({ currentConversationId: id }),
      
      conversationStates: {},
      
      clearConversationState: (conversationId) => set((state) => {
        const newStates = { ...state.conversationStates };
        delete newStates[conversationId];
        return { conversationStates: newStates };
      }),

      setMessages: (conversationId, msgs) => set((state) => ({
        conversationStates: {
          ...state.conversationStates,
          [conversationId]: {
            ...(state.conversationStates[conversationId] || defaultConversationState),
            messages: msgs,
          }
        }
      })),

      addMessage: (conversationId, msg) => set((state) => {
        const convState = state.conversationStates[conversationId] || defaultConversationState;
        // Immutable append - NEVER replace array
        const newMessages = [...convState.messages, msg];
        return {
          conversationStates: {
            ...state.conversationStates,
            [conversationId]: {
              ...convState,
              messages: newMessages,
            }
          }
        };
      }),

      addOptimisticMessage: (conversationId, msg) => set((state) => {
        const convState = state.conversationStates[conversationId] || defaultConversationState;
        const newMessages = [...convState.messages, msg];
        const newOptimisticIds = new Set(convState.pendingOptimisticIds || []);
        newOptimisticIds.add(msg.id);
        return {
          conversationStates: {
            ...state.conversationStates,
            [conversationId]: {
              ...convState,
              messages: newMessages,
              pendingOptimisticIds: newOptimisticIds,
            }
          }
        };
      }),

      reconcileMessages: (conversationId, serverMessages) => set((state) => {
        const convState = state.conversationStates[conversationId];
        if (!convState) {
          // No existing state, just set server messages
          return {
            conversationStates: {
              ...state.conversationStates,
              [conversationId]: {
                ...defaultConversationState,
                messages: serverMessages,
              }
            }
          };
        }

        // Reconcile: keep optimistic messages, merge with server messages
        const optimisticIds = convState.pendingOptimisticIds || new Set();
        const optimisticMessages = convState.messages.filter(m => optimisticIds.has(m.id));
        
        // Create a map of server messages by ID for deduplication
        const serverMessageMap = new Map(serverMessages.map(m => [m.id, m]));
        
        // Merge: server messages + optimistic messages not yet confirmed
        const mergedMessages = [
          ...serverMessages,
          ...optimisticMessages.filter(m => !serverMessageMap.has(m.id))
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        return {
          conversationStates: {
            ...state.conversationStates,
            [conversationId]: {
              ...convState,
              messages: mergedMessages,
              // Clear optimistic IDs that are now in server messages
              pendingOptimisticIds: new Set(
                Array.from(optimisticIds).filter(id => !serverMessageMap.has(id))
              ),
            }
          }
        };
      }),

      updateStreamingContent: (conversationId, content) => set((state) => ({
        conversationStates: {
          ...state.conversationStates,
          [conversationId]: {
            ...(state.conversationStates[conversationId] || defaultConversationState),
            streamingContent: content,
          }
        }
      })),

      setIsAiTyping: (conversationId, typing) => set((state) => ({
        conversationStates: {
          ...state.conversationStates,
          [conversationId]: {
            ...(state.conversationStates[conversationId] || defaultConversationState),
            isAiTyping: typing,
          }
        }
      })),

      crisisAlert: false,
      setCrisisAlert: (crisis) => set({ crisisAlert: crisis }),

      // UI
      activeView: "chat",
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: "menai-db-storage", // IDB key
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
        conversations: state.conversations,
        // Only persist messages, NOT streaming state or optimistic IDs
        conversationStates: Object.fromEntries(
          Object.entries(state.conversationStates).map(([id, convState]) => [
            id,
            { messages: convState.messages }, // Only persist messages
          ])
        ),
      }),
    }
  )
);
