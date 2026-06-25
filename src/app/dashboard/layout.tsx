"use client";

import { useEffect, useState, useRef } from "react";
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
  Calendar,
  History,
  Activity,
} from "lucide-react";
import { ClaySidebarLink, PageTransition } from "@/components/ui";

const primaryNav = [
  { href: "/dashboard", icon: Compass, label: "Overview" },
  { href: "/dashboard/chat", icon: MessageSquare, label: "Intelligence" },
  { href: "/dashboard/plans", icon: Calendar, label: "Today's Plan" },
  { href: "/dashboard/timeline", icon: History, label: "Timeline" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

const adminNav = { href: "/dashboard/admin", icon: Activity, label: "Admin" };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const userLoadedRef = useRef(false);

  useEffect(() => {
    if (userLoadedRef.current) return;
    userLoadedRef.current = true;

    const fetchUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }

      await fetch("/api/auth/bootstrap", { method: "POST" });

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      setUser({
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
      });
    };

    fetchUser();
  }, [setUser, router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("dashboard-nav-open", mobileMenuOpen);
    return () => document.body.classList.remove("dashboard-nav-open");
  }, [mobileMenuOpen]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div className="ambient-bg" />

      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "40px",
            paddingLeft: "8px",
          }}
        >
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <span
              style={{
                fontSize: "1.2rem",
                fontWeight: 500,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              MenAI
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="sidebar-close-btn"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
          {primaryNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <ClaySidebarLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive}
                onClick={() => setMobileMenuOpen(false)}
              />
            );
          })}
          {user?.role === "admin" && (
            <ClaySidebarLink
              href={adminNav.href}
              icon={adminNav.icon}
              label={adminNav.label}
              active={pathname.startsWith(adminNav.href)}
              onClick={() => setMobileMenuOpen(false)}
            />
          )}
        </nav>

        <div style={{ paddingTop: "16px", marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px" }}>
            <div
              className="clay-card-inset"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 500,
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
              }}
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <div
          className={`dashboard-mobile-header ${pathname.startsWith("/dashboard/chat") ? "mobile-header-hidden" : ""}`}
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", padding: 4 }}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <span style={{ fontWeight: 500, letterSpacing: "-0.02em" }}>MenAI</span>
          <div style={{ width: 24 }} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: pathname.startsWith("/dashboard/chat") ? "hidden" : undefined,
          }}
        >
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        />
      )}
    </div>
  );
}
