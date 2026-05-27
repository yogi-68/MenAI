"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  Target,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: Heart,
    title: "Personalized Support",
    description:
      "An AI companion that learns about you, understands your needs, and adapts its guidance to what works best for you.",
  },
  {
    icon: Target,
    title: "Progress Without Pressure",
    description:
      "Track what matters to you without rigid systems. Gentle reminders, flexible goals, and support when you need it.",
  },
  {
    icon: Sparkles,
    title: "Always Available",
    description:
      "24/7 access to guidance, clarity, and encouragement. Your companion is here whenever you need a moment of support.",
  },
];

export default function LandingPage() {
  return (
    <div style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* ====== NAVBAR ====== */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(12px)",
          background: "var(--bg-glass)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <Image src="/logo.png" alt="MenAI" width={36} height={36} style={{ borderRadius: "50%" }} />
          <div>
            <span
              style={{
                fontSize: "1.25rem",
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
            <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", letterSpacing: "0.06em" }}>LIFE COMPANION</span>
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href="/login"
            style={{
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontWeight: 500,
              padding: "8px 20px",
              borderRadius: "var(--radius-full)",
            }}
          >
            Log In
          </Link>
          <Link href="/signup" className="btn-primary" style={{ textDecoration: "none", padding: "10px 24px", fontSize: "0.9rem" }}>
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ====== HERO ====== */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "140px 24px 80px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          style={{ maxWidth: "800px" }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "var(--radius-full)",
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              marginBottom: "32px",
              fontSize: "0.85rem",
              color: "var(--accent-primary)",
              fontWeight: 500,
            }}
          >
            <Sparkles size={14} />
            Your intelligent companion for a better life
          </div>

          <h1
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: "24px",
            }}
          >
            Find clarity.{" "}
            <span className="gradient-text">Make progress.</span>{" "}
            Feel supported.
          </h1>

          <p
            style={{
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
              maxWidth: "600px",
              margin: "0 auto 40px",
              lineHeight: 1.7,
            }}
          >
            An AI companion that understands you, helps you reflect on what matters, and supports your journey to a more fulfilling life.
          </p>

          <Link
            href="/signup"
            className="btn-primary"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "1.05rem",
              padding: "16px 36px",
            }}
          >
            Start Your Journey
            <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>

      {/* ====== FEATURES ====== */}
      <section
        style={{
          padding: "100px 24px",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: "64px" }}
        >
          <h2 style={{ fontSize: "2.5rem", fontWeight: 700, marginBottom: "16px" }}>
            Support designed{" "}
            <span className="gradient-text">for you</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", maxWidth: "520px", margin: "0 auto" }}>
            Thoughtful features that adapt to your needs and help you grow at your own pace.
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "32px",
            maxWidth: "1000px",
            margin: "0 auto",
          }}
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="glass-card"
              style={{ padding: "40px", textAlign: "center" }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                }}
              >
                <feature.icon size={28} color="white" />
              </div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "12px" }}>
                {feature.title}
              </h3>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.95rem" }}>
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ====== SOCIAL PROOF ====== */}
      <section style={{ padding: "60px 24px", textAlign: "center", background: "var(--bg-secondary)" }}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ maxWidth: "800px", margin: "0 auto" }}
        >
          <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)", marginBottom: "24px" }}>
            Join people who are taking small steps toward meaningful change
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "32px", flexWrap: "wrap" }}>
            {["Free to start", "No credit card", "Cancel anytime"].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle2 size={18} color="var(--accent-primary)" />
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ====== FINAL CTA ====== */}
      <section style={{ padding: "100px 24px", textAlign: "center" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "52px 36px",
            borderRadius: "var(--radius-xl)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-50%",
              left: "-50%",
              width: "200%",
              height: "200%",
              background: "radial-gradient(circle at center, rgba(59, 130, 246, 0.08), transparent 60%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Heart size={40} style={{ color: "var(--accent-primary)", marginBottom: "20px" }} />
            <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "12px" }}>
              Ready to start?
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "28px", lineHeight: 1.7, fontSize: "0.95rem" }}>
              Your AI companion is here to help you reflect, grow, and make meaningful progress — one step at a time.
            </p>
            <Link
              href="/signup"
              className="btn-primary"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "14px 36px",
                fontSize: "1rem",
              }}
            >
              Get Started Free
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer
        style={{
          padding: "24px",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          color: "var(--text-muted)",
          fontSize: "0.8rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src="/logo.png" alt="MenAI" width={20} height={20} style={{ borderRadius: "50%" }} />
          <span>© {new Date().getFullYear()} MenAI. Your intelligent life companion.</span>
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <Link href="/login" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Login</Link>
          <Link href="/signup" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Sign Up</Link>
        </div>
      </footer>
    </div>
  );
}
