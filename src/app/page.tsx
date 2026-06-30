"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import {
  Target,
  Calendar,
  MessageSquare,
  ArrowRight,
  Menu,
  X,
  Brain,
  TrendingUp,
  Check,
} from "lucide-react";

/* ── data ─────────────────────────────────────── */

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

const pricingTiers = [
  {
    name: "Starter",
    price: "Free",
    detail: "Full execution system for one active goal",
    features: ["5-step onboarding", "Daily plan + tasks", "Coach chat", "Overview analytics"],
  },
  {
    name: "Pro",
    price: "$19",
    detail: "Multiple goals + advanced reviews",
    features: ["Unlimited goals", "Weekly + monthly reviews", "Priority model routing", "Timeline exports"],
    highlighted: true,
  },
  {
    name: "Team",
    price: "Custom",
    detail: "Coaching teams and accountability groups",
    features: ["Shared dashboards", "Admin insights", "SSO", "Dedicated support"],
  },
];

const features = [
  {
    icon: Target,
    title: "Initiatives, not wishlists",
    description:
      "Define what you're building — career moves, health systems, revenue targets. MenAI tracks active initiatives and keeps them in focus every day.",
    color: "#7c6fff",
    bg: "rgba(124,111,255,0.08)",
    border: "rgba(124,111,255,0.15)",
  },
  {
    icon: Calendar,
    title: "Daily execution plans",
    description:
      "AI-generated daily plans grounded in your initiatives and context. Three tasks that matter, not twenty that don't. Adjusted every morning.",
    color: "#a78bfa",
    bg: "rgba(124,111,255,0.1)",
    border: "rgba(124,111,255,0.2)",
  },
  {
    icon: MessageSquare,
    title: "Execution coach",
    description:
      "An intelligence layer that knows your trajectory, blockers, and patterns. Ask what's blocking you — get direction, not platitudes.",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.15)",
  },
];

const steps = [
  {
    num: "01",
    icon: Target,
    title: "Set your initiatives",
    desc: "Define what you're executing toward — not vague goals, but specific outcomes with timelines and success criteria.",
    tags: ["Career moves", "Health systems", "Revenue targets"],
    color: "#7c6fff",
    bg: "rgba(124,111,255,0.08)",
    border: "rgba(124,111,255,0.15)",
  },
  {
    num: "02",
    icon: Brain,
    title: "Get your daily plan",
    desc: "Every morning, MenAI generates a grounded daily plan from your initiatives, energy levels, and yesterday's context.",
    tags: ["3 focused tasks", "Context-aware", "Auto-adjusted"],
    color: "#a78bfa",
    bg: "rgba(124,111,255,0.1)",
    border: "rgba(124,111,255,0.2)",
  },
  {
    num: "03",
    icon: TrendingUp,
    title: "Execute & reflect",
    desc: "Complete tasks, log blockers, get coaching. Weekly reviews surface patterns. Month by month, your execution system compounds.",
    tags: ["Blocker coaching", "Weekly reviews", "Momentum tracking"],
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.15)",
  },
];

/* ── animation variants ───────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: [0.25, 0.4, 0.25, 1] as [number,number,number,number] },
  }),
};

/* ── components ───────────────────────────────── */

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition: "all 0.4s ease",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        background: scrolled ? "var(--bg-secondary)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--border-color)" : "1px solid transparent",
        boxShadow: scrolled ? "var(--shadow-sm)" : "none",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <BrandLogo size={32} style={{ borderRadius: 10 }} />
          <div>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, display: "block", lineHeight: 1.1, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              MenAI
            </span>
            <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", letterSpacing: "0.1em", display: "block" }}>EXECUTION OS</span>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="landing-desktop-nav" style={{ display: "flex", alignItems: "center", gap: 28, flex: 1, justifyContent: "center" }}>
          {navLinks.map((l) => (
            <a key={l.label} href={l.href} style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500, fontSize: "0.875rem", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="landing-desktop-nav" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Link href="/login" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500, fontSize: "0.875rem", padding: "8px 12px", transition: "color 0.2s" }}>
            Log in
          </Link>
          <Link
            href="/signup"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)", fontWeight: 600, fontSize: "0.875rem", padding: "9px 20px", borderRadius: 9999, textDecoration: "none", display: "flex", alignItems: "center", gap: 6, transition: "opacity 0.2s" }}
          >
            Start Free →
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="landing-mobile-toggle"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", padding: 8, display: "none" }}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)", overflow: "hidden" }}
          >
            <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 4 }}>
              {navLinks.map((l) => (
                <a key={l.label} href={l.href} onClick={() => setOpen(false)}
                  style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500, padding: "10px 0", borderBottom: "1px solid var(--border-color)", fontSize: "0.95rem" }}>
                  {l.label}
                </a>
              ))}
              <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href="/login" style={{ color: "var(--text-secondary)", textDecoration: "none", textAlign: "center", padding: "10px", fontWeight: 500 }}>Log in</Link>
                <Link href="/signup" style={{ background: "var(--text-primary)", color: "var(--bg-primary)", fontWeight: 600, padding: "12px", borderRadius: 9999, textDecoration: "none", textAlign: "center" }}>Start Free →</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

/* ── main page ───────────────────────────────── */

export default function LandingPage() {
  return (
    <div style={{ background: "#0f0f11", color: "var(--text-primary)", minHeight: "100vh", overflowX: "hidden" }}>
      <Navbar />

      {/* ─── HERO ──────────────────────────── */}
      <section style={{ paddingTop: 112, paddingBottom: 80, paddingLeft: "clamp(16px,4vw,32px)", paddingRight: "clamp(16px,4vw,32px)", position: "relative", overflow: "hidden" }}>
        {/* Background glow */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-30%", left: "50%", transform: "translateX(-50%)", width: 900, height: 600, background: "rgba(124,111,255,0.06)", borderRadius: "50%", filter: "blur(120px)" }} />
          <div style={{ position: "absolute", top: "10%", right: "-5%", width: 400, height: 400, background: "rgba(124,111,255,0.05)", borderRadius: "50%", filter: "blur(100px)" }} />
        </div>

        <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
            {/* Left */}
            <div>
              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0} style={{ marginBottom: 28 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 9999, background: "rgba(124,111,255,0.1)", border: "1px solid rgba(124,111,255,0.25)", fontSize: "0.8rem", color: "#a78bfa", fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                  Beta open — early access, free forever
                </div>
              </motion.div>

              <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1}
                style={{ fontSize: "clamp(2.4rem,5.5vw,4.2rem)", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.04em", marginBottom: 24 }}>
                Turn intentions into{" "}
                <span style={{ background: "linear-gradient(135deg,#7c6fff,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  daily execution
                </span>
              </motion.h1>

              <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2}
                style={{ fontSize: "1.1rem", lineHeight: 1.7, color: "var(--text-secondary)", maxWidth: 500, marginBottom: 40 }}>
                MenAI connects your goals to your daily actions. It builds your plan every morning, coaches you through blockers, and reviews your momentum weekly — so you actually ship what matters.
              </motion.p>

              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}
                style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
                <Link href="/signup"
                  style={{ background: "var(--text-primary)", color: "var(--bg-primary)", fontWeight: 700, fontSize: "0.95rem", padding: "13px 28px", borderRadius: 9999, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", transition: "opacity 0.2s, transform 0.2s" }}>
                  Build your system <ArrowRight size={17} />
                </Link>
                <a href="#how-it-works"
                  style={{ color: "var(--text-secondary)", fontSize: "0.95rem", fontWeight: 500, padding: "13px 24px", borderRadius: 9999, border: "1px solid var(--border-color)", background: "var(--bg-glass)", textDecoration: "none", transition: "all 0.2s" }}>
                  See how it works
                </a>
              </motion.div>

              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4}
                style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {["Free forever plan", "No credit card", "Your data stays yours", "Setup in 5 min"].map((t) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <Check size={13} style={{ color: "#22c55e", flexShrink: 0 }} />
                    {t}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right — product visual */}
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
              className="hero-visual"
            >
              <div style={{ borderRadius: 24, border: "1px solid var(--border-color)", background: "var(--bg-secondary)", boxShadow: "var(--shadow-lg)", overflow: "hidden", position: "relative" }}>
                {/* Window chrome */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-tertiary)" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["#ef4444","#f59e0b","#22c55e"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.7 }} />)}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>MenAI — Today&apos;s Plan</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                    <span style={{ fontSize: "0.7rem", color: "#22c55e", fontWeight: 600 }}>In sync</span>
                  </div>
                </div>

                {/* Dashboard content */}
                <div style={{ padding: 20, background: "var(--bg-primary)" }}>
                  {/* Date header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Thursday, June 19</div>
                      <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>Today&apos;s Execution Plan</div>
                    </div>
                    <div style={{ padding: "4px 12px", borderRadius: 9999, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", fontSize: "0.72rem", color: "#60a5fa", fontWeight: 600 }}>3 tasks</div>
                  </div>

                  {/* Tasks */}
                  {[
                    { title: "Finish API integration for auth module", initiative: "Launch v2.0", done: true, color: "#3b82f6" },
                    { title: "Write newsletter draft (500 words)", initiative: "Audience growth", done: false, color: "#8b5cf6" },
                    { title: "30-min strength training session", initiative: "Health system", done: false, color: "#10b981" },
                  ].map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", marginBottom: 8, borderRadius: 12, background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${t.done ? t.color : "var(--border-color)"}`, background: t.done ? t.color : "transparent", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {t.done && <Check size={10} color="white" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500, color: t.done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: t.done ? "line-through" : "none", lineHeight: 1.3 }}>{t.title}</div>
                        <div style={{ fontSize: "0.7rem", marginTop: 4, color: t.color, fontWeight: 600 }}>↗ {t.initiative}</div>
                      </div>
                    </div>
                  ))}

                  {/* Coach prompt */}
                  <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                    <div style={{ fontSize: "0.7rem", color: "#60a5fa", fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>🧠 Execution Coach</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      You&apos;re 2 days behind on the newsletter. Want me to break the writing task into a smaller 10-min sprint for today?
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
                  {[
                    { label: "Weekly Score", value: "74%", color: "#3b82f6" },
                    { label: "Active Goals", value: "3", color: "#8b5cf6" },
                    { label: "Day Streak", value: "12d", color: "#10b981" },
                  ].map((s) => (
                    <div key={s.label} style={{ padding: "10px 14px", textAlign: "center", borderRight: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating cards */}
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9, duration: 0.5 }}
                style={{ position: "absolute", left: -44, top: 60, background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 16, padding: "12px 16px", boxShadow: "var(--shadow-md)" }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 4 }}>Execution rate</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>+41%</div>
                <div style={{ fontSize: "0.68rem", color: "#22c55e", fontWeight: 600 }}>↑ vs last month</div>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.1, duration: 0.5 }}
                style={{ position: "absolute", right: -36, bottom: 80, background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 16, padding: "12px 16px", boxShadow: "var(--shadow-md)" }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 4 }}>Plan quality</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>9.1/10</div>
                <div style={{ fontSize: "0.68rem", color: "#3b82f6", fontWeight: 600 }}>AI-rated</div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ──────────────────────── */}
      <section id="features" style={{ padding: "96px clamp(16px,4vw,32px)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5 }} style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ display: "inline-block", marginBottom: 14, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c6fff" }}>Features</div>
            <h2 style={{ fontSize: "clamp(1.75rem,3.5vw,2.75rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.12, marginBottom: 14 }}>
              Built on intelligent<br />foundations
            </h2>
            <p style={{ fontSize: "1rem", color: "var(--text-secondary)", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>
              Three pillars. One system. No gamification. No fluff.
            </p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
            {features.map((f, i) => (
              <motion.div key={f.title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} custom={i}
                style={{ padding: 24, borderRadius: 24, border: `1px solid ${f.border}`, background: f.bg, transition: "transform 0.25s, box-shadow 0.25s", cursor: "default" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.01)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--bg-secondary)", border: `1px solid ${f.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <f.icon size={20} style={{ color: f.color }} />
                </div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 10, letterSpacing: "-0.015em" }}>{f.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ──────────────────── */}
      <section id="how-it-works" style={{ padding: "96px clamp(16px,4vw,32px)", borderTop: "1px solid var(--border-color)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5 }} style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ display: "inline-block", marginBottom: 14, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c6fff" }}>How it works</div>
            <h2 style={{ fontSize: "clamp(1.75rem,3.5vw,2.75rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.12, marginBottom: 14 }}>
              Three steps to your<br />execution system
            </h2>
            <p style={{ fontSize: "1rem", color: "var(--text-secondary)", maxWidth: 460, margin: "0 auto", lineHeight: 1.7 }}>
              From vision to daily output in minutes — then it compounds from there.
            </p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 20 }}>
            {steps.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} custom={i}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: step.bg, border: `2px solid ${step.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <step.icon size={22} style={{ color: step.color }} />
                  </div>
                </div>
                <div style={{ padding: "24px 24px", borderRadius: 24, border: `1px solid ${step.border}`, background: step.bg, textAlign: "center" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.01)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                >
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: step.color, display: "block", marginBottom: 10 }}>Step {step.num}</span>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>{step.title}</h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 18 }}>{step.desc}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                    {step.tags.map(tag => (
                      <span key={tag} style={{ padding: "4px 10px", borderRadius: 8, background: "var(--bg-secondary)", border: `1px solid ${step.border}`, fontSize: "0.72rem", color: step.color, fontWeight: 600 }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BEFORE / AFTER COACH ─────────── */}
      <section style={{ padding: "80px clamp(16px,4vw,32px)", borderTop: "1px solid var(--border-color)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
          <div style={{ padding: 24, borderRadius: 20, border: "1px solid var(--border-color)", background: "rgba(239,68,68,0.06)" }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ef4444", marginBottom: 12 }}>Generic coach task</p>
            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              &ldquo;Work on your business today.&rdquo; — no deadline, no milestone, no link to your actual plan.
            </p>
          </div>
          <div style={{ padding: 24, borderRadius: 20, border: "1px solid rgba(124,111,255,0.25)", background: "rgba(124,111,255,0.08)" }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a78bfa", marginBottom: 12 }}>MenAI coach task</p>
            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              &ldquo;DM 3 finance founders on LinkedIn — supports milestone: first agency client by Apr 30.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─────────────────────── */}
      <section id="pricing" style={{ padding: "96px clamp(16px,4vw,32px)", borderTop: "1px solid var(--border-color)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-block", marginBottom: 14, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a78bfa" }}>Pricing</div>
            <h2 style={{ fontSize: "clamp(1.75rem,3.5vw,2.5rem)", fontWeight: 800, letterSpacing: "-0.03em" }}>Simple tiers. No surprises.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                style={{
                  padding: 28,
                  borderRadius: 24,
                  border: tier.highlighted ? "1px solid rgba(124,111,255,0.4)" : "1px solid var(--border-color)",
                  background: tier.highlighted ? "rgba(124,111,255,0.08)" : "var(--bg-secondary)",
                }}
              >
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>{tier.name}</h3>
                <p style={{ fontSize: "2rem", fontWeight: 800, margin: "8px 0" }}>{tier.price}</p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 16 }}>{tier.detail}</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
                  {tier.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ───────────────────────────── */}
      <section style={{ padding: "96px clamp(16px,4vw,32px)", position: "relative", overflow: "hidden", borderTop: "1px solid var(--border-color)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 400, background: "rgba(59,130,246,0.05)", borderRadius: "50%", filter: "blur(120px)" }} />
        </div>
        <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div style={{ maxWidth: 660, margin: "0 auto", textAlign: "center", padding: "52px clamp(24px,6vw,56px)", borderRadius: 32, border: "1px solid rgba(59,130,246,0.15)", background: "var(--bg-card)", backdropFilter: "blur(20px)", position: "relative", overflow: "hidden" }}>
              {/* gradient top bar */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#7c6fff,#a78bfa,rgba(124,111,255,0.4))", borderRadius: "32px 32px 0 0" }} />
              <div style={{ display: "inline-block", marginBottom: 14, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c6fff" }}>Get Started</div>
              <h2 style={{ fontSize: "clamp(1.75rem,3.5vw,2.25rem)", fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.12, marginBottom: 14 }}>
                Stop planning.<br />Start executing.
              </h2>
              <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", maxWidth: 420, margin: "0 auto 32px", lineHeight: 1.7 }}>
                Set your first initiative, generate today&apos;s plan, and talk to your execution coach. Beta is open — feedback shapes the product.
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                <Link href="/signup"
                  style={{ background: "var(--text-primary)", color: "var(--bg-primary)", fontWeight: 700, fontSize: "0.95rem", padding: "13px 28px", borderRadius: 9999, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "var(--shadow-md)", transition: "opacity 0.2s" }}>
                  Get started free <ArrowRight size={17} />
                </Link>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
                {["Free plan included", "No credit card", "5-min setup"].map(item => (
                  <span key={item} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    <Check size={12} style={{ color: "#22c55e" }} />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────── */}
      <footer className="landing-footer" style={{ padding: "40px clamp(16px,4vw,32px)", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
        <div className="landing-footer-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandLogo size={20} className="landing-logo" />
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>© {new Date().getFullYear()} MenAI — Execution operating system</span>
        </div>
        <div className="landing-footer-links" style={{ display: "flex", gap: 24 }}>
          <Link href="/privacy" style={{ fontSize: "0.85rem", color: "var(--text-muted)", textDecoration: "none" }}>Privacy Policy</Link>
          <Link href="/terms" style={{ fontSize: "0.85rem", color: "var(--text-muted)", textDecoration: "none" }}>Terms of Service</Link>
          <a href="mailto:hello@menai.app" style={{ fontSize: "0.85rem", color: "var(--text-muted)", textDecoration: "none" }}>Contact</a>
        </div>
      </footer>

      {/* Responsive styles */}
      <style jsx global>{`
        .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
        .hero-visual { position: relative; }
        .landing-desktop-nav { display: flex; }
        .landing-mobile-toggle { display: none !important; }
        @media (max-width: 1024px) {
          .hero-grid { grid-template-columns: 1fr; }
          .hero-visual { display: none; }
        }
        @media (max-width: 768px) {
          .landing-desktop-nav { display: none !important; }
          .landing-mobile-toggle { display: flex !important; }
          .landing-footer { flex-direction: column; justify-content: flex-start; align-items: flex-start !important; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
