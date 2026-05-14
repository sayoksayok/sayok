import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sayok.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SayOK — Make your message better before you send",
  description:
    "Communication optimizer for DMs, email, and social posts. Improve tone and clarity in any input language; output in the language you choose.",
  keywords: [
    "message rewriter",
    "communication",
    "DM",
    "email",
    "social media",
    "multilingual",
    "pre-send",
  ],
  icons: {
    icon: "/character.jpg",
    shortcut: "/character.jpg",
    apple: "/character.jpg",
  },
  openGraph: {
    title: "SayOK — Make your message better before you send",
    description: "Rewrite and refine messages before you send—any input language, your chosen output language.",
    type: "website",
    images: ["/character.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
