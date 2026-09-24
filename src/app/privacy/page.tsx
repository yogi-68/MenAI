import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, NON_CLINICAL_BOUNDARY } from "@/lib/product/brand";

export const metadata: Metadata = {
  title: `Privacy — ${BRAND.name}`,
  description: `How ${BRAND.name} handles your data.`,
};

/**
 * Privacy policy.
 *
 * The footer has linked here since the first version of the landing page; the
 * route did not exist, so the link 404'd.
 *
 * This describes what the code actually does today. It is not legal advice and
 * should be reviewed before a public launch.
 */
export default function PrivacyPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="lp-brand">
          <span className="lp-brand-name">{BRAND.name}</span>
        </Link>
      </header>

      <main className="lp-section lp-legal">
        <h1 className="lp-h1" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}>
          Privacy
        </h1>
        <p className="lp-body">Last updated: {new Date().getFullYear()}</p>

        <h2>What we store</h2>
        <p className="lp-body">
          Your account (email and name), your goals and tasks, your daily state readings and
          any notes attached to them, your reflections, and your conversations with the
          coach. We also store a model of what the coach has learned about you, derived from
          all of the above.
        </p>

        <h2>Why we store it</h2>
        <p className="lp-body">
          To be a coach rather than a task list. A coach that forgets what you said last week
          is not useful, so the product is built on remembering. Everything we keep exists to
          make the next plan and the next conversation more specific to you.
        </p>

        <h2>Who can see it</h2>
        <p className="lp-body">
          You. Access is enforced at the database level — every table is scoped to the
          account that owns the row. Your chat messages are sent to OpenAI to generate
          responses; they are not used to train their models under our API terms.
        </p>

        <h2>Sensitive content</h2>
        <p className="lp-body">
          State readings, reflections and coach conversations are personal. We do not sell
          them, we do not share them with advertisers, and we do not use them for any purpose
          other than running the product for you. {NON_CLINICAL_BOUNDARY}
        </p>

        <h2>Your data, on request</h2>
        <p className="lp-body">
          You can export everything we hold about you as a single file, and you can delete
          your account permanently. Deletion removes your data rather than hiding it, and it
          cannot be undone. Both are available in Settings.
        </p>

        <h2>Contact</h2>
        <p className="lp-body">
          Questions about any of this: reach us through the address in your account settings.
        </p>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-row">
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
          <nav aria-label="Footer">
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
