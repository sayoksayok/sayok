import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sayok.chat";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "SayOK — Private AI Work OS",
  description:
    "A private AI work operating system that helps founders organize tasks, projects, approvals, prepared work, and activity history.",
  keywords: [
    "private work operating system",
    "founder productivity",
    "project memory",
    "approval workflow",
    "task execution",
    "activity history",
    "work assistant",
  ],
  icons: {
    icon: "/character.jpg",
    shortcut: "/character.jpg",
    apple: "/character.jpg",
  },
  openGraph: {
    title: "SayOK — Private AI Work OS",
    description:
      "Private founder work state, quick capture, approval workflows, prepared work, and activity history.",
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
