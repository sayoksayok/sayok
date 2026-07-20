import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sayok.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SayOK — From first contact to OK",
  description:
    "An execution OS that turns workspace context, company data, agents, and approvals into the next action that earns an OK.",
  keywords: [
    "relationship management",
    "founder sales",
    "business development",
    "deal execution",
    "agents",
    "approvals",
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
      "Workspace context, company memory, agents, and approvals for moving real business relationships forward.",
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
