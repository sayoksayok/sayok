import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Contact, Lead, LeadDiscoveryInput, WebsiteAnalysis } from '@/lib/lead-types'

type IntentUser = {
  id: string
  email?: string | null
  authProvider?: string | null
  companyDomain?: string | null
  roleTitle?: string | null
  marketingConsent?: boolean
  consentTimestamp?: string | null
}

type RunContext = {
  user?: IntentUser | null
  sessionId: string
  source?: string | null
  referrer?: string | null
  locale?: string | null
  ipCountry?: string | null
}

type SegmentTags = {
  direction?: string
  user_industry?: string
  target_industry?: string
  target_region?: string
  goal_type?: string
  cross_border?: boolean
  japan_market_intent?: boolean
  confidence?: number
}

type RunResultRow = {
  run_id: string
  organization_name: string
  organization_website: string
  contact_name: string | null
  contact_role: string | null
  masked_email: string | null
  email_status: string
  source_url: string
}

let adminClient: SupabaseClient | null = null

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminClient
}

export function getLeadRunContext(request: Request, input: LeadDiscoveryInput): RunContext {
  return {
    sessionId: sanitizeSessionId(input.sessionId),
    source: request.headers.get('origin') || null,
    referrer: request.headers.get('referer') || request.headers.get('referrer') || null,
    locale: request.headers.get('accept-language')?.split(',')[0]?.trim() || null,
    ipCountry: getCoarseCountry(request),
  }
}

export async function resolveIntentUser(request: Request, input: LeadDiscoveryInput): Promise<IntentUser | null> {
  const client = getAdminClient()
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''

  if (client && token) {
    const { data } = await client.auth.getUser(token)
    const authUser = data.user
    if (authUser?.id) {
      const email = authUser.email || null
      const user: IntentUser = {
        id: authUser.id,
        email,
        authProvider: 'google',
        companyDomain: getCompanyDomain(email),
        roleTitle: getRoleTitle(authUser.user_metadata),
        marketingConsent: input.marketingConsent || false,
        consentTimestamp: input.marketingConsent ? new Date().toISOString() : null,
      }
      return { ...user, id: await upsertIntentUser(user) || user.id }
    }
  }

  if (input.capturedEmail) {
    const email = input.capturedEmail.trim().toLowerCase()
    if (isValidEmail(email) && await hasEmailMx(email)) {
      const user: IntentUser = {
        id: crypto.randomUUID(),
        email,
        authProvider: 'email_capture',
        companyDomain: getCompanyDomain(email),
        marketingConsent: input.marketingConsent || false,
        consentTimestamp: input.marketingConsent ? new Date().toISOString() : null,
      }
      return { ...user, id: await upsertIntentUser(user) || user.id }
    }
  }

  return null
}

export async function createLeadRun(input: LeadDiscoveryInput, context: RunContext) {
  const client = getAdminClient()
  if (!client) return null

  if (context.user) {
    context.user.id = await upsertIntentUser(context.user) || context.user.id
  }

  const { data, error } = await client
    .from('lead_runs')
    .insert({
      user_id: context.user?.id || null,
      session_id: context.sessionId,
      input_url: input.websiteUrl,
      target_market: input.targetMarket,
      business_goal: input.goal,
      source: context.source || null,
      referrer: context.referrer || null,
      locale: context.locale || null,
      ip_country: context.ipCountry || null,
      run_status: 'started',
    })
    .select('id')
    .single()

  if (error) {
    console.error('lead_runs insert failed:', error)
    return null
  }
  return data.id as string
}

export async function finishLeadRun(runId: string | null, status: 'completed' | 'failed') {
  const client = getAdminClient()
  if (!client || !runId) return
  const { error } = await client.from('lead_runs').update({ run_status: status }).eq('id', runId)
  if (error) console.error('lead_runs update failed:', error)
}

export async function saveRunResults(runId: string | null, leads: Lead[], contacts: Contact[]) {
  const client = getAdminClient()
  if (!client || !runId) return

  const rows: RunResultRow[] = []
  for (const lead of leads) {
    const leadContacts = contacts.filter((contact) => contact.leadId === lead.id)
    if (leadContacts.length === 0) {
      rows.push({
        run_id: runId,
        organization_name: lead.organizationName,
        organization_website: lead.organizationWebsite,
        contact_name: null,
        contact_role: null,
        masked_email: null,
        email_status: 'not_found',
        source_url: lead.sourceUrl,
      })
      continue
    }
    rows.push(...leadContacts.map((contact) => ({
      run_id: runId,
      organization_name: lead.organizationName,
      organization_website: lead.organizationWebsite,
      contact_name: contact.name || null,
      contact_role: contact.title || null,
      masked_email: maskEmail(contact.email),
      email_status: contact.emailStatus,
      source_url: contact.sourceUrl || lead.sourceUrl,
    })))
  }

  if (rows.length === 0) return
  const { error } = await client.from('run_results').insert(rows.slice(0, 100))
  if (error) console.error('run_results insert failed:', error)
}

export async function saveRunSegment(runId: string | null, input: LeadDiscoveryInput, analysis: WebsiteAnalysis, apiKey: string) {
  const client = getAdminClient()
  if (!client || !runId || !apiKey) return

  let raw = ''
  let parsed: SegmentTags | null = null
  let needsReview = false

  try {
    raw = await classifyLeadRun(input, analysis, apiKey)
    parsed = parseSegmentJson(raw)
  } catch (error) {
    raw = error instanceof Error ? error.message : 'Segmentation failed'
    needsReview = true
  }

  if (!parsed) needsReview = true

  const { error } = await client.from('run_segments').upsert({
    run_id: runId,
    direction: parsed?.direction || null,
    user_industry: parsed?.user_industry || null,
    target_industry: parsed?.target_industry || null,
    target_region: parsed?.target_region || input.targetMarket,
    goal_type: parsed?.goal_type || null,
    cross_border: parsed?.cross_border ?? null,
    japan_market_intent: parsed?.japan_market_intent ?? false,
    confidence: typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null,
    raw_response: raw,
    needs_review: needsReview,
  }, { onConflict: 'run_id' })

  if (error) console.error('run_segments upsert failed:', error)
}

export async function captureEmailUser(input: Pick<LeadDiscoveryInput, 'capturedEmail' | 'marketingConsent'>) {
  const email = input.capturedEmail?.trim().toLowerCase()
  if (!email || !isValidEmail(email) || !(await hasEmailMx(email))) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  const user: IntentUser = {
    id: crypto.randomUUID(),
    email,
    authProvider: 'email_capture',
    companyDomain: getCompanyDomain(email),
    marketingConsent: input.marketingConsent || false,
    consentTimestamp: input.marketingConsent ? new Date().toISOString() : null,
  }
  await upsertIntentUser(user)
  return { ok: true }
}

async function upsertIntentUser(user: IntentUser): Promise<string | null> {
  const client = getAdminClient()
  if (!client) return null

  if (user.email) {
    const { data: existing } = await client
      .from('users')
      .select('id, marketing_consent, consent_timestamp')
      .eq('email', user.email)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await client.from('users').update({
        auth_provider: user.authProvider || null,
        company_domain: user.companyDomain || null,
        role_title: user.roleTitle || null,
        marketing_consent: Boolean(existing.marketing_consent || user.marketingConsent),
        consent_timestamp: existing.consent_timestamp || user.consentTimestamp || null,
      }).eq('id', existing.id)
      if (error) console.error('users update failed:', error)
      return existing.id as string
    }
  }

  const { data, error } = await client.from('users').insert({
    id: user.id,
    email: user.email || null,
    auth_provider: user.authProvider || null,
    company_domain: user.companyDomain || null,
    role_title: user.roleTitle || null,
    marketing_consent: user.marketingConsent || false,
    consent_timestamp: user.consentTimestamp || null,
  }).select('id').single()
  if (error) console.error('users upsert failed:', error)
  return (data?.id as string | undefined) || null
}

async function classifyLeadRun(input: LeadDiscoveryInput, analysis: WebsiteAnalysis, apiKey: string) {
  const prompt = `You are a B2B intent segmentation classifier for SayOK lead generation.
Return ONLY JSON. No prose. No markdown fences.

Input URL: ${input.websiteUrl}
Target market raw text: ${input.targetMarket}
Business goal raw text: ${input.goal}
Inferred product: ${analysis.product}
Inferred audience: ${analysis.targetAudience}
Inferred positioning: ${analysis.positioning}

Return this exact JSON shape:
{
  "direction": "inbound_to_japan" | "outbound_from_japan" | "domestic" | "other",
  "user_industry": "<short label inferred from input_url>",
  "target_industry": "<short label from target_market>",
  "target_region": "<country/region from target_market>",
  "goal_type": "book_meetings" | "partnerships" | "hiring" | "sales" | "fundraising" | "other",
  "cross_border": true | false,
  "japan_market_intent": true | false,
  "confidence": 0.0-1.0
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!response.ok) throw new Error(`Segmentation failed: ${response.status}`)
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

function parseSegmentJson(raw: string): SegmentTags | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    return JSON.parse(cleaned) as SegmentTags
  } catch {
    return null
  }
}

function sanitizeSessionId(sessionId?: string) {
  const clean = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, '')
  return clean && clean.length >= 12 ? clean.slice(0, 120) : crypto.randomUUID()
}

function getCoarseCountry(request: Request) {
  return request.headers.get('x-vercel-ip-country')
    || request.headers.get('cf-ipcountry')
    || request.headers.get('x-country-code')
    || null
}

function maskEmail(email: string) {
  if (!email || !email.includes('@')) return null
  const [local, domain] = email.toLowerCase().split('@')
  const first = local.slice(0, 2)
  return `${first}${'*'.repeat(Math.max(3, local.length - 2))}@${domain}`
}

function getCompanyDomain(email?: string | null) {
  if (!email || !email.includes('@')) return null
  const domain = email.split('@')[1].toLowerCase()
  if (/^(gmail|googlemail|yahoo|hotmail|outlook|icloud|me|proton|aol)\./.test(domain)) return null
  return domain
}

function getRoleTitle(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.title || metadata?.role || metadata?.job_title || metadata?.position
  return typeof value === 'string' ? value : null
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function hasEmailMx(email: string) {
  try {
    const { promises: dns } = await import('dns')
    const domain = email.split('@')[1]
    const records = await dns.resolveMx(domain)
    return records.length > 0
  } catch {
    return false
  }
}
