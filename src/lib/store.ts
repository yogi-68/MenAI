import { create } from "zustand";

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
}

interface AppState {
  // User
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Chat
  currentConversation: Conversation | null;
  conversations: Conversation[];
  messages: Message[];
  isAiTyping: boolean;
  setCurrentConversation: (conv: Conversation | null) => void;
  setConversations: (convs: Conversation[]) => void;
  setMessages: (msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  setIsAiTyping: (typing: boolean) => void;


  // UI
  activeView: string;
  setActiveView: (view: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // User
  user: null,
  setUser: (user) => set({ user }),

  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Chat
  currentConversation: null,
  conversations: [],
  messages: [],
  isAiTyping: false,
  setCurrentConversation: (conv) => set({ currentConversation: conv }),
  setConversations: (convs) => set({ conversations: convs }),
  setMessages: (msgs) => set({ messages: msgs }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setIsAiTyping: (typing) => set({ isAiTyping: typing }),


  // UI
  activeView: "chat",
  setActiveView: (view) => set({ activeView: view }),
}));
