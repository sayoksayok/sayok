import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sayok.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SayOK — From first contact to OK",
  description:
    "A relationship and deal execution OS for founders, consultants, agencies, and business developers.",
  keywords: [
    "relationship management",
    "founder sales",
    "business development",
    "deal execution",
    "follow-up",
    "partnerships",
  ],
  icons: {
    icon: "/character.jpg",
    shortcut: "/character.jpg",
    apple: "/character.jpg",
  },
  openGraph: {
    title: "SayOK — From first contact to OK",
    description:
      "Remember relationships, track opportunities, and prepare the next action that moves a conversation forward.",
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
      <body>{children}</body>
    </html>
  );
}
