import type { Metadata } from 'next'
import LeadDiscoveryClient from './LeadDiscoveryClient'

export const metadata: Metadata = {
  title: 'SayOK Leads - Find real people to contact, with verified public emails',
  description:
    'Paste a website and a goal. SayOK searches the public web, finds real organizations and verified emails, and drafts your outreach. No fake leads, public sources only.',
  alternates: { canonical: 'https://sayok.chat/new-deal' },
  openGraph: {
    title: 'SayOK Leads - real people to contact, outreach already written',
    description: 'Reads your site, searches public sources, verifies emails, drafts outreach.',
    url: 'https://sayok.chat/new-deal',
    type: 'website',
    images: [{ url: 'https://sayok.chat/new-deal-og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image' },
}

export default function NewDealPage() {
  return <LeadDiscoveryClient />
}
