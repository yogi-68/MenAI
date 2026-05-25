"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  MessageCircleHeart,
  Activity,
  BookHeart,
  Target,
  BarChart3,
  LogOut,
  Menu,
  X,
  Plus,
  Sparkles,
  Sun,
  Moon,
  Compass,
  Zap,
  RefreshCcw,
  Battery,
  Settings,
} from "lucide-react";

const primaryNav = [
  { href: "/dashboard", icon: BarChart3, label: "Command Center" },
  { href: "/dashboard/chat", icon: MessageCircleHeart, label: "AI Mentor" },
  { href: "/dashboard/goals", icon: Target, label: "Goals & Tasks" },
  { href: "/dashboard/status", icon: Compass, label: "Life Status" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

const toolsNav = [
  { href: "/dashboard/mood", icon: Zap, label: "Energy & Focus" },
  { href: "/dashboard/journal", icon: BookHeart, label: "Reflections" },
  { href: "/dashboard/exercises", icon: RefreshCcw, label: "Reset Tools" },
  { href: "/dashboard/meditation", icon: Battery, label: "Recovery" },
];


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, setUser, sidebarOpen, toggleSidebar } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const saved = localStorage.getItem("menai-theme") as "dark" | "light" | null;
    const activeTheme = saved || "dark";
    setTheme(activeTheme);
    document.documentElement.classList.toggle("light", activeTheme === "light");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("menai-theme", next);
    document.documentElement.classList.toggle("light", next === "light");
  };

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (profile) {
        setUser({
          id: authUser.id,
          full_name: profile.full_name || authUser.user_metadata?.full_name || "User",
          avatar_url: profile.avatar_url || "",
          role: profile.role || "user",
          subscription_tier: profile.subscription_tier || "free",
          onboarding_completed: profile.onboarding_completed || false,
          therapy_goals: profile.therapy_goals || [],
        });
      }
    };

    fetchUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ===== SIDEBAR ===== */}
      <aside
        className="sidebar"
        style={{
          transform: mobileMenuOpen ? "translateX(0)" : undefined,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "32px",
            paddingLeft: "4px",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
            }}
          >
            <Image src="/logo.png" alt="MenAI" width={36} height={36} style={{ borderRadius: "50%" }} />
            <div>
              <span
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  background: "var(--gradient-primary)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  display: "block",
                  lineHeight: 1.2,
                }}
              >
                MenAI
              </span>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                LIFE OS
              </span>
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Mobile close */}
            <button
              onClick={() => setMobileMenuOpen(false)}
            style={{
              display: "none",
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            className="mobile-only"
          >
            <X size={20} />
          </button>
          </div>
        </div>

        {/* New Chat Button */}
        <Link
          href="/dashboard/chat"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "12px",
            borderRadius: "var(--radius-md)",
            background: "var(--gradient-primary)",
            color: "white",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
            marginBottom: "24px",
            transition: "all 0.3s ease",
          }}
        >
          <Plus size={18} />
          Talk to Mentor
        </Link>

        {/* Nav Items — Primary */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
          {primaryNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}

          {/* Tools Section */}
          <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "16px 12px 6px", marginTop: "8px" }}>
            Tools
          </div>
          {toolsNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "16px",
            marginTop: "16px",
          }}
        >
          {/* Subscription Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              background: "rgba(124, 92, 252, 0.08)",
              marginBottom: "12px",
              fontSize: "0.8rem",
            }}
          >
            <Sparkles size={14} style={{ color: "var(--accent-primary)" }} />
            <span style={{ color: "var(--accent-primary)", fontWeight: 600, textTransform: "capitalize" }}>
              {user?.subscription_tier || "Free"} Plan
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "8px 4px",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--gradient-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "white",
                flexShrink: 0,
              }}
            >
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.full_name || "User"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {user?.role || "user"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "var(--radius-sm)",
                transition: "color 0.2s",
              }}
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main
        style={{
          flex: 1,
          marginLeft: "280px",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        {/* Mobile Header */}
        <div
          style={{
            display: "none",
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            padding: "12px 16px",
            background: "rgba(10, 10, 15, 0.9)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border-color)",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          className="mobile-header"
        >
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            <Menu size={24} />
          </button>
          <span style={{ fontWeight: 600 }}>MenAI</span>
          <div style={{ width: 24 }} />
        </div>

        {children}
      </main>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 35,
          }}
        />
      )}

      <style jsx global>{`
        @media (max-width: 768px) {
          .sidebar {
            z-index: 40 !important;
          }
          main {
            margin-left: 0 !important;
          }
          .mobile-header {
            display: flex !important;
          }
          .mobile-only {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
