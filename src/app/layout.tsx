import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sayok.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SayOK — Private Work OS",
  description:
    "A private AI work operating system for founder tasks, projects, waiting items, prepared work, and activity history.",
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
    title: "SayOK — Private Work OS",
    description:
      "Private founder work state, quick capture, waiting workflows, prepared work, and activity history.",
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
