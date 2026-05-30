"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  Compass,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  Calendar,
  FileText,
  Target,
  Activity,
  History,
} from "lucide-react";

const primaryNav = [
  { href: "/dashboard", icon: Compass, label: "Overview" },
  { href: "/dashboard/chat", icon: MessageSquare, label: "Intelligence" },
  { href: "/dashboard/plans", icon: Calendar, label: "Today's Plan" },
  { href: "/dashboard/goals", icon: Target, label: "Initiatives" },
  { href: "/dashboard/timeline", icon: History, label: "Timeline" },
  { href: "/dashboard/reports", icon: FileText, label: "Reports" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

const adminNav = { href: "/dashboard/admin", icon: Activity, label: "Admin" };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, setUser } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();


  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }

      // Ensure profile exists in database
      await fetch("/api/auth/bootstrap", { method: "POST" });

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      const nextUser = {
        id: authUser.id,
        full_name:
          profile?.full_name ||
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          "User",
        avatar_url:
          profile?.avatar_url || authUser.user_metadata?.avatar_url || "",
        role: profile?.role || "user",
        onboarding_completed: profile?.onboarding_completed || false,
      };

      const current = useAppStore.getState().user;
      if (
        current &&
        current.id === nextUser.id &&
        current.full_name === nextUser.full_name &&
        current.avatar_url === nextUser.avatar_url &&
        current.role === nextUser.role &&
        current.onboarding_completed === nextUser.onboarding_completed
      ) {
        return;
      }

      setUser(nextUser);
    };

    fetchUser();
  }, [setUser, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ===== AMBIENT BACKGROUND ===== */}
      <div className="ambient-bg" />

      {/* ===== SIDEBAR ===== */}
      <aside
        className={`sidebar ${mobileMenuOpen ? "open" : ""}`}
        style={{
          transform: mobileMenuOpen ? "translateX(0)" : undefined,
        }}
      >
        {/* Logo Area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "40px",
            paddingLeft: "8px",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  display: "block",
                  lineHeight: 1.2,
                  letterSpacing: "-0.02em"
                }}
              >
                MenAI
              </span>
            </div>
          </Link>

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

        {/* New Chat Button */}
          <Link
            href="/dashboard/chat"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: "0.9rem",
              marginBottom: "32px",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-glass-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-glass)";
            }}
          >
          <Plus size={16} />
          New Thread
        </Link>

        {/* Nav Items — Primary */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
          {primaryNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {item.label}
              </Link>
            );
          })}
          {user?.role === "admin" && (
            <Link
              href={adminNav.href}
              className={`sidebar-link ${pathname.startsWith(adminNav.href) ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
              style={{ marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}
            >
              <adminNav.icon size={18} strokeWidth={pathname.startsWith(adminNav.href) ? 2 : 1.5} />
              {adminNav.label}
            </Link>
          )}
        </nav>

        {/* User Info (Minimal) */}
        <div style={{ paddingTop: "16px", marginTop: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "8px",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--text-primary)",
                flexShrink: 0,
              }}
            >
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.full_name || "User"}
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
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main
        style={{
          flex: 1,
          marginLeft: "260px", /* matches sidebar width */
          minHeight: "100vh",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Mobile Header */}
        <div
          style={{
            display: "none",
            position: "sticky",
            top: 0,
            zIndex: 30,
            padding: "16px",
            background: "var(--bg-secondary)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border-color)",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          className={`mobile-header ${pathname.startsWith("/dashboard/chat") ? "mobile-header-hidden" : ""}`}
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
          <span style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>MenAI</span>
          <div style={{ width: 24 }} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: pathname.startsWith("/dashboard/chat") ? "hidden" : undefined }}>
          {children}
        </div>
      </main>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(4px)",
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
