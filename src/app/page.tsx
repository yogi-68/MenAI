"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  Target,
  Calendar,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Zap,
  Menu,
  X,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Initiatives, not wishlists",
    description:
      "Define what you're building — career moves, health systems, revenue targets. MenAI tracks active initiatives and keeps them in focus.",
  },
  {
    icon: Calendar,
    title: "Daily execution plans",
    description:
      "AI-generated daily plans grounded in your initiatives and context. Three tasks that matter, not twenty that don't.",
  },
  {
    icon: MessageSquare,
    title: "Execution coach",
    description:
      "An intelligence layer that knows your trajectory, blockers, and patterns. Ask what's blocking you — get direction, not platitudes.",
  },
];

const steps = [
  { num: "01", title: "Set initiatives", desc: "Define what you're executing toward." },
  { num: "02", title: "Get daily plans", desc: "AI builds your day from real context." },
  { num: "03", title: "Execute & reflect", desc: "Complete tasks, review momentum weekly." },
];

export default function LandingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link href="/" className="landing-brand">
          <Image src="/logo.png" alt="MenAI" width={36} height={36} className="landing-logo" priority />
          <div>
            <span className="landing-brand-name">MenAI</span>
            <span className="landing-brand-tag">EXECUTION OS</span>
          </div>
        </Link>

        <div className="landing-nav-actions">
          <Link href="/login" className="landing-nav-link">
            Log In
          </Link>
          <Link href="/signup" className="btn-primary landing-cta-nav">
            Start Free
          </Link>
        </div>

        <button
          type="button"
          className="landing-nav-toggle"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-label="Toggle menu"
        >
          {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {mobileNavOpen && (
          <div className="landing-mobile-menu">
            <Link href="/login" onClick={() => setMobileNavOpen(false)}>
              Log In
            </Link>
            <Link href="/signup" className="btn-primary" onClick={() => setMobileNavOpen(false)}>
              Start Free
            </Link>
          </div>
        )}
      </nav>

      <section className="landing-hero">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="landing-hero-inner"
        >
          <div className="landing-badge">
            <Zap size={14} />
            Personal execution operating system
          </div>

          <h1>
            Turn intentions into{" "}
            <span className="gradient-text">daily execution</span>
          </h1>

          <p className="landing-hero-sub">
            MenAI is not another task app. It connects your initiatives, generates evidence-backed daily plans,
            and coaches you through blockers — so you ship what matters.
          </p>

          <div className="landing-hero-actions">
            <Link href="/signup" className="btn-primary landing-cta-primary">
              Build your system
              <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="landing-cta-secondary">
              I have an account
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <h2>
            Built for people who{" "}
            <span className="gradient-text">execute</span>
          </h2>
          <p>Three pillars. One system. No gamification fluff.</p>
        </div>

        <div className="landing-features">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass-card landing-feature-card"
            >
              <div className="landing-feature-icon">
                <feature.icon size={26} color="white" />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-how">
        <div className="landing-section-header">
          <h2>How it works</h2>
          <p>From vision to daily output in three steps.</p>
        </div>

        <div className="landing-steps">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className="landing-step"
            >
              <span className="landing-step-num">{step.num}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="landing-proof">
        <TrendingUp size={20} style={{ color: "var(--accent-primary)", marginBottom: 12 }} />
        <p>Built for founders, operators, and anyone running multiple priorities at once.</p>
        <div className="landing-proof-items">
          {["Free to start", "No credit card", "Your data stays yours"].map((item) => (
            <div key={item} className="landing-proof-item">
              <CheckCircle2 size={18} color="var(--accent-primary)" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="landing-final-cta glass-card"
        >
          <h2>Stop planning. Start executing.</h2>
          <p>
            Set your first initiative, generate today&apos;s plan, and talk to your execution coach.
            Beta is open — feedback shapes the product.
          </p>
          <Link href="/signup" className="btn-primary landing-cta-primary">
            Get started free
            <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <Image src="/logo.png" alt="MenAI" width={20} height={20} className="landing-logo" />
          <span>© {new Date().getFullYear()} MenAI — Execution operating system</span>
        </div>
        <div className="landing-footer-links">
          <Link href="/login">Login</Link>
          <Link href="/signup">Sign Up</Link>
        </div>
      </footer>
    </div>
  );
}
