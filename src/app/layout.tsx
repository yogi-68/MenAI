import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "MindfulAI — Your AI Mental Wellness Companion",
  description:
    "A compassionate AI companion for mental wellness. Chat therapy, mood tracking, journaling, CBT exercises, and meditation — all in one secure platform.",
  keywords: ["mental health", "AI therapy", "wellness", "CBT", "meditation", "mood tracking"],
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "MindfulAI — Your AI Mental Wellness Companion",
    description: "AI-powered mental wellness. Chat, mood tracking, journaling, CBT exercises & meditation.",
    type: "website",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Ambient background orbs */}
        <div className="ambient-bg" aria-hidden="true">
          <div className="ambient-orb ambient-orb-1" />
          <div className="ambient-orb ambient-orb-2" />
          <div className="ambient-orb ambient-orb-3" />
        </div>
        {children}
      </body>
    </html>
  );
}
