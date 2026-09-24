import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND, NON_CLINICAL_BOUNDARY } from "@/lib/product/brand";
import { STATE_SCALE } from "@/lib/mind/state-scale";

/**
 * Landing page.
 *
 * A server component. The previous version was a 573-line client component
 * built entirely from inline style objects, which meant it shipped its own
 * copy of the design system, bypassed the theme (a hardcoded dark background
 * with themed text, so light mode rendered near-black on near-black), and
 * broke at phone width because an inline grid overrode the media query meant
 * to collapse it.
 *
 * It also sold a $19 Pro tier and a Team tier with SSO that do not exist, and
 * quoted invented metrics ("+41% execution rate") as product data. Both are
 * gone.
 */

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
};

const PILLARS = [
  {
    title: "It learns how your mind works",
    body: "One reading a day — energy, load, what's pulling at you. Over weeks that becomes a model of your actual capacity: when you think clearly, what drains you, what you do right before you stop.",
  },
  {
    title: "Your plan is sized to that",
    body: "Not a fixed quota. On a strong day it hands you the hard thing first. On a depleted day it hands you one thing, and says so. A plan you can't do isn't a plan.",
  },
  {
    title: "It holds you to it",
    body: "A coach that remembers what you said last week and asks about it. It names the pattern you keep repeating. It's direct — encouragement without accountability is just noise.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Seven questions",
    body: "What you're working toward, by when, what gets in the way, and where your head is today. Two minutes. No personality quiz.",
  },
  {
    step: "02",
    title: "Check in daily",
    body: "One number, a few words if you want. That's the whole ritual — and it's what everything else is built on.",
  },
  {
    step: "03",
    title: "Work the plan",
    body: "A short list, matched to your capacity, tied to the thing you said mattered. The coach is there when you're stuck.",
  },
  {
    step: "04",
    title: "It gets sharper",
    body: "It asks one good question at a time, forever. Every answer makes the next plan more yours and less generic.",
  },
];

/** Ends of the scale, to show what it actually means without listing all ten. */
const SCALE_SAMPLE = [
  STATE_SCALE[0],
  STATE_SCALE[4],
  STATE_SCALE[7],
  STATE_SCALE[9],
];

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="lp">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="lp-nav">
        <Link href="/" className="lp-brand" aria-label={`${BRAND.name} home`}>
          <BrandLogo />
          <span className="lp-brand-name">{BRAND.name}</span>
        </Link>

        <nav className="lp-nav-links" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#method">The method</a>
        </nav>

        <div className="lp-nav-actions">
          <Link href="/login" className="lp-link">
            Log in
          </Link>
          <Link href="/signup" className="lp-btn lp-btn-primary">
            Start free
          </Link>
        </div>
      </header>

      <main id="main">
        {/* ---- Hero ------------------------------------------------------- */}
        <section className="lp-hero">
          <p className="lp-eyebrow">Free while in beta</p>

          <h1 className="lp-h1">
            Most plans fail because
            <br />
            <span className="lp-accent">they ignore the person doing them.</span>
          </h1>

          <p className="lp-lede">
            {BRAND.name} is a mental performance coach. It learns how your mind actually
            works — your energy, your patterns, what drains you — and sizes the work to the
            capacity you have today, not the capacity you wish you had.
          </p>

          <div className="lp-hero-actions">
            <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
              Start free
            </Link>
            <a href="#how" className="lp-btn lp-btn-ghost lp-btn-lg">
              See how it works
            </a>
          </div>

          <p className="lp-note">Seven questions to start. No card.</p>
        </section>

        {/* ---- The daily reading ------------------------------------------ */}
        <section className="lp-section lp-scale" aria-labelledby="scale-heading">
          <h2 id="scale-heading" className="lp-h2">
            It starts with one honest number
          </h2>
          <p className="lp-body lp-center">
            Every day, you rate where you are. That single reading is what separates a coach
            from a checklist — it's how the plan knows what to ask of you.
          </p>

          <ul className="lp-scale-grid">
            {SCALE_SAMPLE.map((option) => (
              <li key={option.score} className="lp-scale-card">
                <span className="lp-scale-score" data-numeric>
                  {option.score}
                </span>
                <span className="lp-scale-label">{option.label}</span>
                <span className="lp-scale-capacity">{option.capacity}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Pillars ----------------------------------------------------- */}
        <section id="method" className="lp-section" aria-labelledby="method-heading">
          <h2 id="method-heading" className="lp-h2">
            The method
          </h2>

          <div className="lp-grid-3">
            {PILLARS.map((pillar) => (
              <article key={pillar.title} className="lp-card">
                <h3 className="lp-h3">{pillar.title}</h3>
                <p className="lp-body">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---- How it works ------------------------------------------------ */}
        <section id="how" className="lp-section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="lp-h2">
            How it works
          </h2>

          <ol className="lp-steps">
            {STEPS.map((item) => (
              <li key={item.step} className="lp-card lp-step">
                <span className="lp-step-num" data-numeric aria-hidden="true">
                  {item.step}
                </span>
                <h3 className="lp-h3">{item.title}</h3>
                <p className="lp-body">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Contrast ----------------------------------------------------- */}
        <section className="lp-section" aria-labelledby="contrast-heading">
          <h2 id="contrast-heading" className="lp-h2">
            The difference, concretely
          </h2>

          <div className="lp-grid-2">
            <article className="lp-card lp-card-muted">
              <p className="lp-tag">A generic app, on your worst day</p>
              <p className="lp-quote">&ldquo;You have 3 tasks due. You&rsquo;re 2 days behind.&rdquo;</p>
              <p className="lp-body">
                The same demand whatever state you&rsquo;re in. So on the days it matters most,
                you close it.
              </p>
            </article>

            <article className="lp-card lp-card-accent">
              <p className="lp-tag">{BRAND.name}, on your worst day</p>
              <p className="lp-quote">
                &ldquo;You&rsquo;re at 3 and that&rsquo;s the third low day this week — it&rsquo;s
                always Thursdays after your standups. One thing today: the email. Leave the rest.&rdquo;
              </p>
              <p className="lp-body">
                It knows the pattern because you told it, one question at a time.
              </p>
            </article>
          </div>
        </section>

        {/* ---- Close -------------------------------------------------------- */}
        <section className="lp-section lp-close">
          <h2 className="lp-h2">Start with today</h2>
          <p className="lp-body lp-center">
            One number, one goal, and a plan that fits the person you actually are this week.
          </p>
          <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
            Start free
          </Link>
        </section>
      </main>

      <footer className="lp-footer">
        <p className="lp-boundary">{NON_CLINICAL_BOUNDARY}</p>
        <div className="lp-footer-row">
          <span>
            © {year} {BRAND.name}
          </span>
          <nav aria-label="Footer">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
