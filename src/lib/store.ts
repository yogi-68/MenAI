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
  streamingContent: string;
  isAiTyping: boolean;
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
  
  // Actions for the ACTIVE conversation
  setMessages: (conversationId: string, msgs: Message[]) => void;
  addMessage: (conversationId: string, msg: Message) => void;
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
  streamingContent: "",
  isAiTyping: false,
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
        return {
          conversationStates: {
            ...state.conversationStates,
            [conversationId]: {
              ...convState,
              messages: [...convState.messages, msg],
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
        conversationStates: state.conversationStates,
      }),
    }
  )
);
