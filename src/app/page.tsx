"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  MessageCircleHeart,
  BookHeart,
  Activity,
  Shield,
  Sparkles,
  ArrowRight,
  Heart,
  Moon,
  Brain,
} from "lucide-react";

const features = [
  {
    icon: MessageCircleHeart,
    title: "AI Therapy Chat",
    description:
      "Talk to a compassionate AI companion trained in CBT, mindfulness, and evidence-based techniques.",
  },
  {
    icon: Activity,
    title: "Mood Tracking",
    description:
      "Track your emotional patterns over time with beautiful visualizations and AI-powered insights.",
  },
  {
    icon: BookHeart,
    title: "Smart Journaling",
    description:
      "Write freely and receive AI-generated insights, sentiment analysis, and pattern recognition.",
  },
  {
    icon: Brain,
    title: "CBT Exercises",
    description:
      "Guided cognitive behavioral therapy exercises like thought records, behavioral activation, and grounding.",
  },
  {
    icon: Moon,
    title: "Guided Meditation",
    description:
      "Calming meditation sessions for sleep, anxiety relief, self-compassion, and morning calm.",
  },
  {
    icon: Shield,
    title: "Crisis Support",
    description:
      "Always-on safety system that provides immediate emergency resources when you need them most.",
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
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(12px)",
          background: "rgba(10, 10, 15, 0.8)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <Image src="/logo.png" alt="MindfulAI" width={36} height={36} style={{ borderRadius: "50%" }} />
          <span
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              background: "var(--gradient-primary)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            MindfulAI
          </span>
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
          padding: "120px 24px 80px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "var(--radius-full)",
              background: "rgba(124, 92, 252, 0.1)",
              border: "1px solid rgba(124, 92, 252, 0.2)",
              marginBottom: "32px",
              fontSize: "0.85rem",
              color: "var(--accent-primary)",
              fontWeight: 500,
            }}
          >
            <Sparkles size={14} />
            AI-Powered Mental Wellness
          </div>

          <h1
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 800,
              lineHeight: 1.1,
              marginBottom: "24px",
              maxWidth: "800px",
            }}
          >
            Your mind deserves a{" "}
            <span className="gradient-text">compassionate</span> companion
          </h1>

          <p
            style={{
              fontSize: "1.15rem",
              color: "var(--text-secondary)",
              maxWidth: "560px",
              marginBottom: "40px",
              lineHeight: 1.7,
            }}
          >
            Evidence-based therapy techniques with empathetic AI — available 24/7, completely private.
          </p>

          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
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
              Start Free
              <ArrowRight size={18} />
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "40px",
            marginTop: "80px",
            maxWidth: "500px",
            width: "100%",
          }}
        >
          {[
            { value: "24/7", label: "Available" },
            { value: "100%", label: "Private" },
            { value: "Free", label: "To Start" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 800,
                  background: "var(--gradient-primary)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ====== FEATURES ====== */}
      <section
        id="features"
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
            Everything for your{" "}
            <span className="gradient-text">wellbeing</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", maxWidth: "500px", margin: "0 auto" }}>
            Evidence-based tools powered by AI, designed for your emotional health.
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "24px",
          }}
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass-card"
              style={{ padding: "32px", cursor: "default" }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "20px",
                }}
              >
                <feature.icon size={24} color="white" />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "8px" }}>
                {feature.title}
              </h3>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, fontSize: "0.95rem" }}>
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ====== CTA ====== */}
      <section style={{ padding: "80px 24px", textAlign: "center" }}>
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
              background: "radial-gradient(circle at center, rgba(124, 92, 252, 0.08), transparent 60%)",
              pointerEvents: "none",
            }}
          />
          <Heart size={40} style={{ color: "var(--accent-tertiary)", marginBottom: "20px" }} />
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "12px" }}>
            Your wellbeing matters
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "28px", lineHeight: 1.7, fontSize: "0.95rem" }}>
            Take the first step toward a healthier mind. Free to start, always private.
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
        </motion.div>
      </section>

      {/* ====== FOOTER (minimal startup) ====== */}
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
          <Image src="/logo.png" alt="MindfulAI" width={20} height={20} style={{ borderRadius: "50%" }} />
          <span>© {new Date().getFullYear()} MindfulAI</span>
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <Link href="/login" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Login</Link>
          <Link href="/signup" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Sign Up</Link>
        </div>
      </footer>
    </div>
  );
}
