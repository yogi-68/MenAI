import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string;
  role: string;
  subscription_tier: string;
  onboarding_completed: boolean;
}

interface Conversation {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  emotion_data?: Record<string, unknown>;
  crisis?: boolean;
}

interface AppState {
  // User
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Chat - PERSISTED STATE
  currentConversationId: string | null;
  conversations: Conversation[];
  messages: Message[];
  streamingContent: string;
  isAiTyping: boolean;
  crisisAlert: boolean;
  
  // Chat Actions
  setCurrentConversationId: (id: string | null) => void;
  setConversations: (convs: Conversation[]) => void;
  setMessages: (msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  updateStreamingContent: (content: string) => void;
  setIsAiTyping: (typing: boolean) => void;
  setCrisisAlert: (crisis: boolean) => void;
  clearChat: () => void;

  // UI
  activeView: string;
  setActiveView: (view: string) => void;
}

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

      // Chat - PERSISTED
      currentConversationId: null,
      conversations: [],
      messages: [],
      streamingContent: "",
      isAiTyping: false,
      crisisAlert: false,
      
      setCurrentConversationId: (id) => set({ currentConversationId: id }),
      setConversations: (convs) => set({ conversations: convs }),
      setMessages: (msgs) => set({ messages: msgs }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      updateStreamingContent: (content) => set({ streamingContent: content }),
      setIsAiTyping: (typing) => set({ isAiTyping: typing }),
      setCrisisAlert: (crisis) => set({ crisisAlert: crisis }),
      clearChat: () => set({ 
        messages: [], 
        currentConversationId: null, 
        streamingContent: "", 
        crisisAlert: false 
      }),

      // UI
      activeView: "chat",
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: "menai-chat-storage", // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist chat-related state
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
        messages: state.messages,
        conversations: state.conversations,
      }),
    }
  )
);
