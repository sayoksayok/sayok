import { NextResponse } from 'next/server'
import type { LeadDiscoveryConfig } from '@/lib/lead-types'

const REQUIRED_KEYS = ['BRAVE_SEARCH_API_KEY', 'FIRECRAWL_API_KEY', 'HUNTER_API_KEY', 'ANTHROPIC_API_KEY']
const OPTIONAL_KEYS = ['APOLLO_API_KEY']

export function GET() {
  const missing = REQUIRED_KEYS.filter((key) => !process.env[key])
  const configured = [...REQUIRED_KEYS, ...OPTIONAL_KEYS].filter((key) => Boolean(process.env[key]))

  const config: LeadDiscoveryConfig = {
    ready: missing.length === 0,
    missing,
    required: REQUIRED_KEYS,
    optional: OPTIONAL_KEYS,
    configured,
    instructions: [
      'Set BRAVE_SEARCH_API_KEY in Vercel and .env.local.',
      'Set FIRECRAWL_API_KEY in Vercel and .env.local.',
      'Set HUNTER_API_KEY in Vercel and .env.local.',
      'Keep ANTHROPIC_API_KEY set for analysis and outreach generation.',
      'Restart the local Next.js server after changing .env.local.',
      'Redeploy after changing Vercel environment variables.',
    ],
  }

  return NextResponse.json(config)
}
