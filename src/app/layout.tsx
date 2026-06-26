import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Syne, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/providers";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MenAI — Your AI Life Operating System",
  description:
    "An AI execution coach and life operating system. Goal tracking, accountability, strategic coaching, and personal growth intelligence — available 24/7.",
  keywords: ["AI mentor", "execution coach", "accountability", "goal tracking", "life OS", "productivity", "personal growth"],
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "MenAI — Your AI Life Operating System",
    description: "AI-powered execution coaching. Goal tracking, accountability, strategic planning & personal growth intelligence.",
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
    <html
      lang="en"
      className="dark"
      suppressHydrationWarning
      style={{ background: "#0f0f11", color: "#eceef2" }}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('menai-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.style.background='#f4f5f7';document.documentElement.style.color='#0f1117';}else{document.documentElement.classList.add('dark');document.documentElement.style.background='#0f0f11';document.documentElement.style.color='#eceef2';}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body
        className={`${syne.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} ${plusJakarta.className} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
