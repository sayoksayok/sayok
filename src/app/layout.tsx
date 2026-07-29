import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sayok.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SayOK — Find real prospects and write outreach",
  description:
    "Read your website, find real organizations and public contact sources, write personalized outreach, and approve every message before sending.",
  keywords: [
    "lead discovery",
    "B2B outreach",
    "sales prospecting",
    "business development",
    "public contact research",
  ],
  icons: {
    icon: "/character.jpg",
    shortcut: "/character.jpg",
    apple: "/character.jpg",
  },
  openGraph: {
    title: "SayOK — Find real prospects and write outreach",
    description:
      "From your website to verified public contact sources and personalized outreach.",
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
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
