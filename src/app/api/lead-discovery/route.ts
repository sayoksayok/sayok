import { NextRequest, NextResponse } from 'next/server'
import { promises as dns } from 'dns'
import type {
  Contact,
  Lead,
  LeadDiscoveryInput,
  LeadDiscoveryResult,
  LeadRelationshipType,
  LeadStatus,
  OutreachMessage,
  WebsiteAnalysis,
} from '@/lib/lead-types'
import {
  createLeadRun,
  finishLeadRun,
  getLeadRunContext,
  resolveIntentUser,
  saveRunResults,
  saveRunSegment,
} from '@/lib/lead-intent-store'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'

export const maxDuration = 120

type FirecrawlResponse = {
  success?: boolean
  data?: {
    markdown?: string
    html?: string
    title?: string
    metadata?: Record<string, unknown>
  }
}

type BraveResult = {
  title?: string
  url?: string
  description?: string
}

type HunterEmail = {
  value?: string
  first_name?: string | null
  last_name?: string | null
  position?: string | null
  linkedin?: string | null
  confidence?: number | null
  sources?: { uri?: string }[]
}

type HunterDomainResponse = {
  data?: {
    emails?: HunterEmail[]
  }
}

type HunterVerifyResponse = {
  data?: {
    result?: string
    score?: number
  }
}

type RuntimeKeys = {
  braveSearchApiKey: string
  firecrawlApiKey: string
  hunterApiKey: string
  anthropicApiKey: string
  apolloApiKey: string
}

type LeadCampaign = {
  id: 'default' | 'dogeday_2026_sponsorship'
  label: string
  brief: string
  minConfidence: number
  excludedTerms: string[]
  excludedDomains: string[]
}

const DEFAULT_CAMPAIGN: LeadCampaign = {
  id: 'default',
  label: 'General lead discovery',
  brief: '',
  minConfidence: 0.6,
  excludedTerms: [],
  excludedDomains: [],
}

const DOGEDAY_CAMPAIGN: LeadCampaign = {
  id: 'dogeday_2026_sponsorship',
  label: 'DOGE DAY 2026 sponsorship',
  minConfidence: 0.65,
  brief: `DOGE DAY 2026 is an Own The Doge event in Japan built around Kabosu's birthday and the global Doge community. The sponsor offer includes brand activations, media placement, speaking opportunities, VIP access, community reach, merchandise or digital-collectible collaboration, and access to crypto and consumer-brand decision makers. The best prospects are established organizations with both budget and a credible reason to reach crypto-native, internet-culture, gaming, consumer, Japan/APAC, or community audiences. Never treat a generic B2B vendor as a sponsor merely because it appeared in search.`,
  excludedTerms: [
    'revolut',
    'magic eden',
    'ledger',
    'youtooz',
    'd3.inc',
    'myetherwallet',
    'mew.xyz',
    'fuckjerry',
    'taschen',
    'own the doge',
  ],
  excludedDomains: [
    'revolut.com',
    'magiceden.io',
    'ledger.com',
    'youtooz.com',
    'd3.inc',
    'myetherwallet.com',
    'mew.xyz',
    'fuckjerry.com',
    'taschen.com',
    'ownthedoge.com',
  ],
}

const BLOCKED_DOMAINS = new Set([
  'bing.com',
  'duckduckgo.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'microsoft.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'wikipedia.org',
  'crunchbase.com',
  'glassdoor.com',
  'indeed.com',
  'collegefactual.com',
  'emb-japan.go.jp',
  'espressoenglish.net',
  'hotcoursesabroad.com',
  'jasso.go.jp',
  'niche.com',
  'us.emb-japan.go.jp',
  'universities.com',
  'yahoo.com',
  'gogonihon.com',
  'mylanguageexchange.com',
  'proofpoint.com',
  'protection.outlook.com',
  'seitojapanese.com',
])

const BLOCKED_RESULT_TERMS = [
  'embassy',
  'consulate',
  'career center',
  'jasso',
  'japan student services organization',
  'jet program',
  'go! go! nihon',
  'gogonihon',
  'my language exchange',
  'mylanguageexchange',
  'espresso english',
  'online japanese lessons',
  'online japanese tutor',
  'japanese tutor',
  'japanese tutoring',
  'private japanese lesson',
  'private japanese tutor',
  'japanese lessons online',
  'learn japanese online',
  'japanese online course',
  'seitojapanese',
  'english lesson',
  'english grammar',
  'learn english',
  'online english',
  'best colleges',
  'best universities',
  'top universities',
  'courses in the usa',
  'study abroad information',
  'visa',
  'scholarship',
  'customer service phone number',
  'phone number 1-',
  'help center',
  'customer support',
  'u.s. digital service',
  'us digital service',
  'department of government efficiency',
  'federal government',
]

export async function POST(request: NextRequest) {
  const auth = await requireSalesAgentUser(request)
  if (auth instanceof NextResponse) return auth

  const input = (await request.json()) as LeadDiscoveryInput
  const keys = getRuntimeKeys(input)
  const campaign = resolveLeadCampaign(input, auth.user.email || '')

  const validationError = validateInput(input)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const context = getLeadRunContext(request, input)
  context.user = await resolveIntentUser(request, input)
  const runId = await createLeadRun(input, context)

  try {
    const website = await scrapeWebsite(input.websiteUrl, keys)
    const analysis = await analyzeWebsite(input, website, keys, campaign)
    const searchQueries = expandSearchQueries(input, analysis.searchQueries, campaign)
    const braveResults = await searchBrave(searchQueries, input.maxLeads ?? 14, input.targetMarket, keys, campaign)
    const leads = await scoreLeads(input, analysis, braveResults, keys, campaign)
    const { contacts, warnings: hunterWarnings } = await discoverContacts(leads, keys, campaign)
    const { contacts: apolloContacts, warning: apolloWarning } = await discoverApolloContacts(leads, keys)
    const mergedContacts = prioritizeContacts(mergeContacts([...contacts, ...apolloContacts]), campaign)
    const leadsWithStatus = applyLeadStatuses(leads, mergedContacts)
    const outreach = await generateOutreach(input, analysis, website, leadsWithStatus, mergedContacts, keys)
    const finalLeads = prioritizeActionableLeads(leadsWithStatus.map((lead) => {
      const hasOutreach = outreach.some((message) => message.leadId === lead.id)
      return hasOutreach ? { ...lead, status: 'outreach_ready' as LeadStatus } : lead
    }), mergedContacts, input, campaign)
    await saveRunResults(runId, finalLeads, mergedContacts)
    await saveRunSegment(runId, input, analysis, keys.anthropicApiKey)
    await finishLeadRun(runId, 'completed')

    const result: LeadDiscoveryResult = {
      id: runId || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      input: {
        websiteUrl: input.websiteUrl,
        targetMarket: input.targetMarket,
        goal: input.goal,
        maxLeads: input.maxLeads,
      },
      analysis,
      leads: finalLeads,
      contacts: mergedContacts,
      outreach,
      integrationStatus: {
        firecrawl: keys.firecrawlApiKey ? 'connected' : 'direct_fetch',
        brave: keys.braveSearchApiKey ? 'connected' : 'public_search',
        hunter: keys.hunterApiKey ? 'connected' : 'public_email_extract',
        apollo: keys.apolloApiKey ? (apolloWarning ? 'attempted_with_warning' : 'connected') : 'not_configured_optional',
        llm: keys.anthropicApiKey ? 'connected' : 'qualification_unavailable',
      },
      warnings: [
        ...hunterWarnings,
        ...(apolloWarning ? [apolloWarning] : []),
        ...(!keys.anthropicApiKey
          ? ['AI qualification is unavailable. Unqualified search results were not shown.']
          : []),
        ...campaignWarnings(campaign, finalLeads.length, input.maxLeads ?? 14),
      ],
      campaignId: campaign.id,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error(error)
    await finishLeadRun(runId, 'failed')
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Lead discovery failed.',
      },
      { status: 500 },
    )
  }
}

function resolveLeadCampaign(input: LeadDiscoveryInput, userEmail: string): LeadCampaign {
  const identity = `${userEmail} ${input.websiteUrl} ${input.senderProfile || ''}`.toLowerCase()
  const goal = input.goal.toLowerCase()
  const isOwnTheDoge = userEmail.trim().toLowerCase() === 'dogejapan@ownthedoge.com'
    || /own\s*the\s*doge|ownthedoge\.com/.test(identity)
  const isDogeDaySponsorship = /doge\s*day|dogeday/.test(goal)
    || (isOwnTheDoge && /sponsor|sponsorship|協賛/.test(goal))
  return isOwnTheDoge && isDogeDaySponsorship ? DOGEDAY_CAMPAIGN : DEFAULT_CAMPAIGN
}

function campaignWarnings(campaign: LeadCampaign, found: number, requested: number) {
  if (campaign.id !== 'dogeday_2026_sponsorship' || found >= requested) return []
  if (found === 0) {
    return ['DOGE DAY sponsor search found no candidates that met the campaign quality threshold. Weak or unrelated results were not shown.']
  }
  return [`DOGE DAY sponsor search returned ${found} high-fit candidates. Weak, duplicate, and past-partner results were removed instead of padding the list to ${requested}.`]
}

function getRuntimeKeys(input: LeadDiscoveryInput): RuntimeKeys {
  return {
    braveSearchApiKey: input.apiKeys?.braveSearchApiKey?.trim() || process.env.BRAVE_SEARCH_API_KEY || '',
    firecrawlApiKey: input.apiKeys?.firecrawlApiKey?.trim() || process.env.FIRECRAWL_API_KEY || '',
    hunterApiKey: input.apiKeys?.hunterApiKey?.trim() || process.env.HUNTER_API_KEY || '',
    anthropicApiKey: input.apiKeys?.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY || '',
    apolloApiKey: input.apiKeys?.apolloApiKey?.trim() || process.env.APOLLO_API_KEY || '',
  }
}

function validateInput(input: LeadDiscoveryInput) {
  if (!input.websiteUrl || !input.targetMarket || !input.goal) return 'Website URL, target market, and goal are required.'
  try {
    const url = new URL(input.websiteUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return 'Website URL must start with http:// or https://.'
  } catch {
    return 'Website URL is invalid.'
  }
  return ''
}

async function scrapeWebsite(url: string, keys: RuntimeKeys) {
  if (!keys.firecrawlApiKey) return scrapeWebsiteDirect(url)

  const body = {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    timeout: 30000,
  }

  const endpoints = ['https://api.firecrawl.dev/v2/scrape', 'https://api.firecrawl.dev/v1/scrape']
  let lastError = 'Firecrawl scrape failed.'

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      const data = (await response.json()) as FirecrawlResponse
      const markdown = data.data?.markdown || data.data?.html || ''
      if (!markdown.trim()) throw new Error('Firecrawl returned no readable website content.')
      return {
        title: data.data?.title || String(data.data?.metadata?.title || ''),
        content: markdown.slice(0, 16000),
      }
    }

    lastError = `${endpoint} returned ${response.status}`
    if (response.status !== 404) break
  }

  throw new Error(lastError)
}

async function scrapeWebsiteDirect(url: string) {
  const response = await fetchWithTimeout(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'SayOKLeadDiscovery/1.0',
    },
  }, 8000)

  if (!response.ok) throw new Error(`Could not read website. The site returned ${response.status}.`)
  const html = await response.text()
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''
  const extraContent = await scrapeRelatedPages(url)
  return {
    title,
    content: `${htmlToText(html)} ${extraContent}`.slice(0, 22000),
  }
}

async function scrapeRelatedPages(url: string) {
  const paths = ['/group-lessons', '/support-japan', '/contact']
  try {
    const origin = new URL(url).origin
    const parts: string[] = []
    for (const path of paths) {
      try {
        const response = await fetchWithTimeout(`${origin}${path}`, {
          redirect: 'follow',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'SayOKLeadDiscovery/1.0',
          },
        }, 5000)
        if (!response.ok) continue
        parts.push(htmlToText(await response.text()).slice(0, 3500))
      } catch {
        continue
      }
    }
    return parts.join(' ')
  } catch {
    return ''
  }
}

async function analyzeWebsite(
  input: LeadDiscoveryInput,
  website: { title: string; content: string },
  keys: RuntimeKeys,
  campaign: LeadCampaign,
): Promise<WebsiteAnalysis> {
  const fallback = buildBasicAnalysis(input, website, campaign)
  if (!keys.anthropicApiKey) return fallback

  const prompt = `You are SayOK, a lead discovery operator. Analyze the website and create search queries for finding real organizations to contact. Return only JSON.

Website URL: ${input.websiteUrl}
Target market: ${input.targetMarket}
Goal: ${input.goal}
Website title: ${website.title}
Website content:
${website.content}

Campaign context:
${campaign.brief || 'No additional campaign context.'}

Do not invent leads. Do not invent emails. Search queries must be useful for finding real companies, organizations, distributors, communities, associations, events, agencies, schools, or partners in the target market.
${campaign.id === 'dogeday_2026_sponsorship' ? 'For this campaign, search for credible sponsors with an actual brand, community, event, or partnership fit. Exclude cybersecurity vendors, email infrastructure, generic enterprise software, agencies selling to the sender, and existing Own The Doge partners. Do not search for DOGE DAY itself; search for prospective sponsor organizations.' : ''}

Return JSON:
{
  "product": "plain description",
  "targetAudience": "who buys or adopts it",
  "positioning": "why it matters",
  "businessModel": "likely model",
  "searchQueries": ["6 to 10 specific web search queries"]
}`

  try {
    const data = await callClaude(prompt, 2500, keys)
    const parsed = parseJson<WebsiteAnalysis>(data)
    return {
      product: String(parsed.product || fallback.product),
      targetAudience: String(parsed.targetAudience || fallback.targetAudience),
      positioning: String(parsed.positioning || fallback.positioning),
      businessModel: String(parsed.businessModel || fallback.businessModel),
      searchQueries: Array.isArray(parsed.searchQueries) ? parsed.searchQueries.slice(0, 10).map(String) : fallback.searchQueries,
    }
  } catch {
    return fallback
  }
}

function buildBasicAnalysis(
  input: LeadDiscoveryInput,
  website: { title: string; content: string },
  campaign: LeadCampaign = DEFAULT_CAMPAIGN,
): WebsiteAnalysis {
  const target = input.targetMarket
  const goal = input.goal
  if (campaign.id === 'dogeday_2026_sponsorship') {
    return {
      product: 'DOGE DAY 2026 sponsorship and brand collaboration',
      targetAudience: 'Established crypto, Web3, gaming, consumer, media, payments, collectibles, and loyalty brands with partnership budgets',
      positioning: campaign.brief,
      businessModel: 'Event sponsorship and brand collaboration',
      searchQueries: dogeDaySearchQueries(target),
    }
  }
  const base = `${website.title || input.websiteUrl} ${goal} ${target}`
  return {
    product: website.title || input.websiteUrl,
    targetAudience: goal,
    positioning: website.content.slice(0, 240),
    businessModel: 'Unknown',
    searchQueries: [
      `${base} contact`,
      `${goal} ${target} organizations`,
      `${goal} ${target} companies contact email`,
      `${goal} ${target} association contact`,
      `${goal} ${target} directory`,
    ],
  }
}

function expandSearchQueries(input: LeadDiscoveryInput, queries: string[], campaign: LeadCampaign = DEFAULT_CAMPAIGN) {
  const target = input.targetMarket
  const goal = input.goal
  if (campaign.id === 'dogeday_2026_sponsorship') {
    return [...new Set([...dogeDaySearchQueries(target), ...queries.map((query) => query.trim()).filter(Boolean)])].slice(0, 18)
  }
  const primaryGoal = goal.split(/\.\s*Ideal customers:/i)[0]?.trim() || goal
  const normalized = `${goal} ${target}`.toLowerCase()
  const priority = new Set<string>()
  const additions = new Set<string>()

  if (isJapanMarket(target)) {
    priority.add(`site:co.jp ${primaryGoal} お問い合わせ`)
    priority.add(`site:jp ${primaryGoal} 会社概要`)
    priority.add(`日本企業 ${primaryGoal} 法人 お問い合わせ`)

    if (/広告|agency|marketing|ooh|media/.test(normalized)) {
      priority.add('site:co.jp 広告代理店 お問い合わせ')
      priority.add('site:co.jp OOH 広告 代理店 会社概要')
      priority.add('site:jp デジタル広告 代理店 法人 お問い合わせ')
    }
  }

  priority.add(`${goal} ${target} organizations contact email`)
  priority.add(`${goal} ${target} partnerships contact`)
  priority.add(`${goal} ${target} program director email`)

  if (/student|language|learn|japanese|school|university|college/.test(normalized)) {
    priority.add(`Japanese language program contact email university ${target}`)
    priority.add(`Japanese student association contact email university ${target}`)
    priority.add(`Japanese club contact email university ${target}`)
    priority.add(`Japan America Society language program contact ${target}`)
    priority.add(`site:.edu "Japanese language program" "contact" "${target}"`)
    priority.add(`site:.edu "Japanese club" "contact" "${target}"`)
    priority.add(`site:.edu "Japanese Student Association" "contact" "${target}"`)
    priority.add(`"Japan America Society" "Japanese language" "contact" "${target}"`)
    priority.add(`"Japanese language teachers" association contact "${target}"`)
    priority.add(`"Japanese cultural center" "language" "contact" "${target}"`)
    priority.add(`"Japanese language program" university "${target}" "contact"`)
    priority.add(`"study abroad Japan" university office "${target}" "contact"`)
  }

  if (/distributor|retail|wholesale|reseller/.test(normalized)) {
    priority.add(`${target} distributor contact email`)
    priority.add(`${target} importer distributor association contact`)
    priority.add(`${target} wholesale buyer contact`)
  }

  if (/startup|founder|company|business|partner|partnership/.test(normalized)) {
    priority.add(`${target} startup community partnership contact`)
    priority.add(`${target} business association partnership contact email`)
    priority.add(`${target} accelerator partnership manager contact`)
  }

  if (/meme|ip|license|licensing|nft|crypto|web3|wallet|exchange|token|collectible|collectibles/.test(normalized)) {
    priority.add(`crypto wallet partnerships contact ${target}`)
    priority.add(`web3 wallet partnership manager contact ${target}`)
    priority.add(`crypto exchange partnerships contact ${target}`)
    priority.add(`NFT marketplace brand partnerships contact ${target}`)
    priority.add(`digital collectibles marketplace partnerships contact ${target}`)
    priority.add(`web3 gaming partnerships contact ${target}`)
    priority.add(`crypto payments app partnerships contact ${target}`)
    priority.add(`meme coin community partnerships contact ${target}`)
    priority.add(`crypto media sponsorship partnerships contact ${target}`)
    priority.add(`fintech crypto partnerships contact ${target}`)
    priority.add(`brand licensing digital collectibles partnerships ${target}`)
    priority.add(`web3 marketing agency crypto partnerships contact ${target}`)
  }

  queries.filter(Boolean).forEach((query) => additions.add(query.trim()))
  return [...priority, ...additions].slice(0, 18)
}

function dogeDaySearchQueries(targetMarket: string) {
  const target = targetMarket.trim() || 'United States'
  return [
    `${target} crypto exchange brand partnerships sponsorship`,
    `${target} crypto wallet community partnerships events`,
    `${target} Web3 gaming brand partnerships sponsorship`,
    `${target} crypto payments company marketing partnerships`,
    `${target} digital collectibles platform brand partnerships`,
    `${target} consumer brand internet culture meme marketing partnerships`,
    `${target} crypto media event sponsorship partnerships`,
    `${target} loyalty rewards platform brand partnership sponsorship`,
    `${target} entertainment company Web3 community partnerships`,
    `${target} fintech crypto community event sponsor`,
  ]
}

async function searchBrave(
  queries: string[],
  maxLeads: number,
  targetMarket: string,
  keys: RuntimeKeys,
  campaign: LeadCampaign = DEFAULT_CAMPAIGN,
) {
  if (!keys.braveSearchApiKey) return searchPublicWeb(queries, maxLeads, targetMarket, campaign)

  const results: BraveResult[] = []

  for (const [index, query] of queries.slice(0, 8).entries()) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query)
    url.searchParams.set('count', '8')
    url.searchParams.set('search_lang', isJapanMarket(targetMarket) ? 'ja' : 'en')
    const country = braveCountry(targetMarket)
    if (country) url.searchParams.set('country', country)

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': keys.braveSearchApiKey,
      },
    })

    if (!response.ok) throw new Error(`Brave Search failed for "${query}" with ${response.status}.`)
    const data = (await response.json()) as { web?: { results?: BraveResult[] } }
    results.push(...(data.web?.results || []))
    if (index >= 4 && uniqueOrganizationResults(results, targetMarket, campaign).length >= maxLeads * 2) break
  }

  return uniqueOrganizationResults(results, targetMarket, campaign)
    .sort((a, b) => searchResultScore(b, campaign) - searchResultScore(a, campaign))
    .slice(0, maxLeads * 2)
}

function braveCountry(targetMarket: string) {
  const value = targetMarket.trim().toLowerCase()
  if (['usa', 'us', 'united states', 'america', 'u.s.', 'u.s.a.'].includes(value)) return 'US'
  if (['japan', 'jp', '日本'].includes(value)) return 'JP'
  if (['uk', 'united kingdom', 'britain'].includes(value)) return 'GB'
  if (['canada', 'ca'].includes(value)) return 'CA'
  if (['australia', 'au'].includes(value)) return 'AU'
  return ''
}

async function searchPublicWeb(
  queries: string[],
  maxLeads: number,
  targetMarket: string,
  campaign: LeadCampaign = DEFAULT_CAMPAIGN,
) {
  const results: BraveResult[] = []

  for (const query of queries.slice(0, 8)) {
    results.push(...(await searchDuckDuckGo(query)))
    if (uniqueOrganizationResults(results, targetMarket, campaign).length < maxLeads) {
      results.push(...(await searchYahoo(query)))
    }
    if (uniqueOrganizationResults(results, targetMarket, campaign).length < maxLeads) {
      results.push(...(await searchBing(query)))
    }
    if (uniqueOrganizationResults(results, targetMarket, campaign).length >= maxLeads) break
  }

  return uniqueOrganizationResults(results, targetMarket, campaign)
    .sort((a, b) => searchResultScore(b, campaign) - searchResultScore(a, campaign))
    .slice(0, maxLeads)
}

async function searchDuckDuckGo(query: string) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 SayOKLeadDiscovery/1.0',
    },
  }, 6000)

  if (!response.ok) return []
  const html = await response.text()
  return parseSearchResults(html)
}

async function searchBing(query: string) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 SayOKLeadDiscovery/1.0',
    },
  }, 6000)

  if (!response.ok) return []
  const html = await response.text()
  return parseBingResults(html)
}

async function searchYahoo(query: string) {
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 SayOKLeadDiscovery/1.0',
    },
  }, 6000)

  if (!response.ok) return []
  const html = await response.text()
  return parseYahooResults(html)
}

function parseSearchResults(html: string): BraveResult[] {
  const results: BraveResult[] = []
  const anchorPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = anchorPattern.exec(html)) !== null) {
    const url = unwrapSearchUrl(decodeHtml(match[1] || ''))
    const title = htmlToText(match[2] || '').trim()
    if (url && title) results.push({ title, url, description: '' })
  }

  if (results.length > 0) return results

  const fallbackPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  while ((match = fallbackPattern.exec(html)) !== null) {
    const url = unwrapSearchUrl(decodeHtml(match[1] || ''))
    const title = htmlToText(match[2] || '').trim()
    if (url && title) results.push({ title, url, description: '' })
  }

  return results
}

function parseBingResults(html: string): BraveResult[] {
  const results: BraveResult[] = []
  const itemPattern = /<li[^>]+class="b_algo"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi
  let match: RegExpExecArray | null

  while ((match = itemPattern.exec(html)) !== null) {
    const url = unwrapSearchUrl(decodeHtml(match[1] || ''))
    const title = htmlToText(match[2] || '').trim()
    const description = htmlToText(match[3] || '').trim()
    if (url && title) results.push({ title, url, description })
  }

  return results
}

function parseYahooResults(html: string): BraveResult[] {
  const results: BraveResult[] = []
  const itemPattern = /class="[^"]*algo-sr[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi
  let match: RegExpExecArray | null

  while ((match = itemPattern.exec(html)) !== null) {
    const url = unwrapSearchUrl(decodeHtml(match[1] || ''))
    const title = htmlToText(match[2] || '').trim()
    const description = htmlToText(match[3] || '').trim()
    if (url && title) results.push({ title, url, description })
  }

  return results
}

function unwrapSearchUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, 'https://duckduckgo.com')
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) return uddg

    const yahooTarget = parsed.pathname.match(/\/RU=([^/]+)/)?.[1]
    if (yahooTarget) return decodeURIComponent(yahooTarget)

    const bingEncoded = parsed.searchParams.get('u')
    if (bingEncoded) {
      const withoutPrefix = bingEncoded.startsWith('a1') ? bingEncoded.slice(2) : bingEncoded
      try {
        const decoded = Buffer.from(withoutPrefix, 'base64url').toString('utf8')
        if (decoded.startsWith('http')) return decoded
      } catch {
        // Keep the parsed href below when Bing does not use the encoded target format.
      }
    }

    return parsed.href
  } catch {
    return rawUrl
  }
}

function uniqueOrganizationResults(
  results: BraveResult[],
  targetMarket = '',
  campaign: LeadCampaign = DEFAULT_CAMPAIGN,
) {
  const seen = new Set<string>()
  const unique: BraveResult[] = []

  for (const result of results) {
    if (!result.url || !result.title) continue
    const url = unwrapSearchUrl(result.url)
    const domain = extractDomain(url)
    if (!domain || isBlockedDomain(domain)) continue
    if (isBlockedResult({ ...result, url })) continue
    if (!isResultInTargetMarket({ ...result, url }, targetMarket)) continue
    if (!isCampaignResultEligible({ ...result, url }, campaign)) continue
    const key = canonicalOrganizationDomain(domain)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ ...result, url })
  }

  return unique
}

function isJapanMarket(targetMarket: string) {
  const value = targetMarket.trim().toLowerCase()
  return ['japan', 'jp', '日本', '日本企業', 'japanese market'].includes(value)
    || /(^|\s)(japan|日本)(\s|$)/i.test(value)
}

function isResultInTargetMarket(result: BraveResult, targetMarket: string) {
  const host = extractDomain(result.url || '').replace(/^www\./, '').toLowerCase()
  if (!host) return false
  const targetCountry = targetMarketCountryCode(targetMarket)
  const domainCountry = domainCountryCode(host)
  if (targetCountry && domainCountry && targetCountry !== domainCountry) return false
  if (!isJapanMarket(targetMarket)) return true
  if (host === 'jp' || host.endsWith('.jp')) return true

  const suffix = host.split('.').pop() || ''
  const globallyUsedCountrySuffixes = new Set(['ai', 'co', 'fm', 'io', 'me', 'tv'])
  if (suffix.length === 2 && !globallyUsedCountrySuffixes.has(suffix)) return false

  const text = `${result.title || ''} ${result.description || ''} ${host}`
  const hasJapaneseText = /[ぁ-んァ-ヶ一-龠々]/u.test(text)
  const hasJapanLocation = /(?:^|[\s,|()\-])(japan|tokyo|osaka|kyoto|yokohama|nagoya|fukuoka|日本|東京|大阪|京都|横浜|名古屋|福岡)(?:$|[\s,|()\-])/iu.test(text)
  const hasJapaneseCompanyMarker = /株式会社|合同会社|有限会社|一般社団法人|公益社団法人/u.test(text)
  return hasJapaneseText || hasJapanLocation || hasJapaneseCompanyMarker || /japan/i.test(host)
}

function targetMarketCountryCode(targetMarket: string) {
  const value = targetMarket.trim().toLowerCase()
  if (['usa', 'us', 'united states', 'america', 'u.s.', 'u.s.a.'].includes(value)) return 'US'
  if (['japan', 'jp', '日本', '日本企業', 'japanese market'].includes(value)) return 'JP'
  if (['uk', 'united kingdom', 'britain', 'great britain'].includes(value)) return 'GB'
  if (['canada', 'ca'].includes(value)) return 'CA'
  if (['australia', 'au'].includes(value)) return 'AU'
  return ''
}

function domainCountryCode(host: string) {
  const suffix = host.toLowerCase().split('.').pop() || ''
  const codes: Record<string, string> = {
    us: 'US', jp: 'JP', uk: 'GB', ca: 'CA', au: 'AU', de: 'DE', fr: 'FR', it: 'IT', es: 'ES',
    nl: 'NL', be: 'BE', ch: 'CH', at: 'AT', ie: 'IE', nz: 'NZ', sg: 'SG', in: 'IN', kr: 'KR',
    cn: 'CN', hk: 'HK', tw: 'TW', br: 'BR', mx: 'MX', se: 'SE', no: 'NO', dk: 'DK', fi: 'FI',
    pl: 'PL', pt: 'PT', cz: 'CZ', gr: 'GR', za: 'ZA', ae: 'AE', sa: 'SA', id: 'ID', my: 'MY',
    th: 'TH', vn: 'VN', ph: 'PH',
  }
  return codes[suffix] || ''
}

function isBlockedDomain(domain: string) {
  const host = domain.replace(/^www\./, '')
  return [...BLOCKED_DOMAINS].some((blocked) => host === blocked || host.endsWith(`.${blocked}`))
}

function isBlockedResult(result: BraveResult) {
  const text = `${result.title || ''} ${result.description || ''} ${result.url || ''}`.toLowerCase()
  return BLOCKED_RESULT_TERMS.some((term) => text.includes(term))
}

function searchResultScore(result: BraveResult, campaign: LeadCampaign = DEFAULT_CAMPAIGN) {
  const text = `${result.title || ''} ${result.description || ''} ${result.url || ''}`.toLowerCase()
  if (campaign.id === 'dogeday_2026_sponsorship') return dogeDayCandidateScore(result, campaign)
  let score = 0
  if (/\.edu\b|university|college|department|language program|japanese club|student association/.test(text)) score += 6
  if (/japan america society|japan-america society|japanese cultural|cultural center|teachers association/.test(text)) score += 5
  if (/contact|about|program|department/.test(text)) score += 2
  if (/foundation|association|society|center/.test(text)) score += 1
  if (/course|lesson|online school|competitor/.test(text)) score -= 4
  if (/crypto|web3|wallet|exchange|nft|collectible|partnership|licensing|brand|gaming|payments/.test(text)) score += 4
  return score
}

function isCampaignResultEligible(result: BraveResult, campaign: LeadCampaign) {
  if (campaign.id === 'default') return true
  return dogeDayRelationshipType(result, campaign) !== 'reject' && dogeDayCandidateScore(result, campaign) >= 4
}

function dogeDayRelationshipType(
  result: BraveResult,
  campaign: LeadCampaign = DOGEDAY_CAMPAIGN,
): LeadRelationshipType | 'reject' {
  const domain = canonicalOrganizationDomain(result.url || '')
  const text = `${result.title || ''} ${result.description || ''} ${domain}`.toLowerCase()
  if (campaign.excludedDomains.some((excluded) => domain === excluded || domain.endsWith(`.${excluded}`))) return 'reject'
  if (campaign.excludedTerms.some((term) => text.includes(term))) return 'reject'
  if (/sports business journal|sports betting|gambling|casino|igaming|bookmaker|cybersecurity|email security|consulting firm|marketing agency/.test(text)) return 'reject'

  const isPrimaryCryptoMedia = /crypto (?:news|media)|web3 (?:news|media)|blockchain (?:news|media)|digital asset (?:news|media)|decrypt\.co|coindesk|cointelegraph|blockworks/.test(text)
  const isMedia = /\bmedia\b|news(?:room)?|journal(?:ism)?|editorial|publisher|magazine|press outlet|reporter/.test(text)
  if (isPrimaryCryptoMedia) return 'media_partner'
  if (isMedia) return 'reject'

  if (/activation|experiential|merchandise|collectible|gaming|entertainment|creator platform/.test(text)) {
    return 'activation_partner'
  }

  if (/\bcrypto|web3|blockchain|bitcoin|wallet|exchange|payments?|fintech|loyalty|rewards|consumer brand|streaming|platform/.test(text)) {
    return 'cash_sponsor'
  }

  return 'reject'
}

function dogeDayCandidateScore(result: BraveResult, campaign: LeadCampaign = DOGEDAY_CAMPAIGN) {
  const domain = canonicalOrganizationDomain(result.url || '')
  const text = `${result.title || ''} ${result.description || ''} ${domain}`.toLowerCase()
  if (campaign.excludedDomains.some((excluded) => domain === excluded || domain.endsWith(`.${excluded}`))) return -100
  if (campaign.excludedTerms.some((term) => text.includes(term))) return -100

  let score = 0
  if (/\bcrypto|web3|blockchain|bitcoin|wallet|exchange|nft|digital collectible|token|onchain|fintech/.test(text)) score += 5
  if (/gaming|game studio|entertainment|consumer brand|loyalty|rewards|media platform|streaming|creator|collectible/.test(text)) score += 3
  if (/brand partnership|partnerships?|sponsor|sponsorship|brand activation|collaboration|community|event marketing/.test(text)) score += 3
  if (/japan|apac|asia|global|united states|\busa\b/.test(text)) score += 1
  if (/cybersecurity|email security|threat protection|fraud detection|identity security|enterprise security|proofpoint/.test(text)) score -= 10
  if (/careers?|jobs?|documentation|developer docs|support portal|help center/.test(text)) score -= 4
  return score
}

async function scoreLeads(
  input: LeadDiscoveryInput,
  analysis: WebsiteAnalysis,
  results: BraveResult[],
  keys: RuntimeKeys,
  campaign: LeadCampaign = DEFAULT_CAMPAIGN,
): Promise<Lead[]> {
  const excludedTerms = [...new Set([...extractExcludedClientTerms(input), ...campaign.excludedTerms])]
  const usableResults = results
    .filter((result) => !isBlockedResult(result) && !isBlockedDomain(extractDomain(result.url || '')))
    .filter((result) => isResultInTargetMarket(result, input.targetMarket))
    .filter((result) => !matchesExcludedClient(result, excludedTerms))
    .filter((result) => isCampaignResultEligible(result, campaign))
    .sort((a, b) => searchResultScore(b, campaign) - searchResultScore(a, campaign))
  if (usableResults.length === 0) return []

  if (!keys.anthropicApiKey) {
    return []
  }

  const candidates = usableResults.map((result, index) => ({
    id: `lead_${index + 1}`,
    title: result.title,
    url: result.url,
    description: result.description || '',
    domain: extractDomain(result.url || ''),
  }))

  const prompt = `You are SayOK, a lead qualification operator. Rank these real Brave Search results as possible outreach targets.

User website: ${input.websiteUrl}
Goal: ${input.goal}
Target market: ${input.targetMarket}
Business: ${analysis.product}
Target audience: ${analysis.targetAudience}
Campaign: ${campaign.label}
Campaign qualification brief: ${campaign.brief || 'Use the user goal and business analysis.'}
Do not return the user's past/existing clients as new leads. Excluded past/existing clients: ${excludedTerms.length ? excludedTerms.join(', ') : 'none provided'}

Candidates:
${JSON.stringify(candidates, null, 2)}

Use only the provided candidates. Do not create new organizations. Never add a candidate just to reach a requested count. Return fewer candidates when the evidence or commercial fit is weak. The target market is a hard location filter: do not label a company as being in the target country merely because the query mentioned that country. Exclude foreign-country domains and candidates without location evidence. Exclude the user's past/existing clients, encyclopedias, search portals, social networks, job boards, generic directories, email-security or redirect domains, and pages with no practical outreach value.
${campaign.id === 'dogeday_2026_sponsorship' ? `For every accepted candidate, classify the actual commercial role:
- cash_sponsor: an operating brand or platform with a credible audience, community, or market reason to buy sponsorship.
- activation_partner: a company with a concrete product, content, merchandise, gaming, entertainment, or experiential collaboration fit.
- media_partner: only a crypto/Web3-native publication suitable for coverage or content collaboration. This is not a cash sponsor.
Reject general publishers, sports-business media, betting/gambling media, agencies, consultants, security vendors, and organizations that merely discuss sponsorships. Never use an editor or journalist as a sponsorship decision maker. Reject any candidate whose only connection is a keyword in the search query. Return each company/domain once. Use confidence below 0.65 for any uncertain candidate so it will be removed.` : ''}

Return JSON:
{
  "leads": [
    {
      "id": "lead_1",
      "organizationName": "name from result",
      "organizationWebsite": "candidate url or homepage",
      "category": "company/community/distributor/association/event/media/agency/school/partner",
      "country": "target country or inferred country",
      "reasonForFit": "specific practical reason",
      "confidence": 0.1,
      "relationshipType": "cash_sponsor | activation_partner | media_partner"
    }
  ]
}`

  let parsed: { leads?: Partial<Lead>[] }
  try {
    const data = await callClaude(prompt, 3500, keys)
    parsed = parseJson<{ leads?: Partial<Lead>[] }>(data)
  } catch {
    return []
  }
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))

  const qualified = (parsed.leads || [])
    .map((lead, index) => {
      const candidate = campaign.id === 'dogeday_2026_sponsorship'
        ? byId.get(String(lead.id))
        : byId.get(String(lead.id)) || candidates[index]
      if (!candidate) return null
      const relationshipType = campaign.id === 'dogeday_2026_sponsorship'
        ? normalizeDogeDayRelationshipType(lead.relationshipType, candidate)
        : undefined
      const normalizedLead: Lead = {
        id: String(lead.id || candidate.id),
        organizationName: String(lead.organizationName || candidate.title),
        organizationWebsite: normalizeHomepage(String(
          campaign.id === 'dogeday_2026_sponsorship'
            ? candidate.url || ''
            : lead.organizationWebsite || candidate.url || '',
        )),
        category: String(lead.category || 'organization'),
        country: String(lead.country || input.targetMarket),
        reasonForFit: campaign.id === 'dogeday_2026_sponsorship'
          ? dogeDayReason(candidate, relationshipType)
          : String(lead.reasonForFit || candidate.description || 'Matched by real search result.'),
        sourceUrl: String(candidate.url || ''),
        confidence: clampConfidence(Number(lead.confidence || 0.5)),
        status: 'found' as LeadStatus,
        relationshipType,
      }
      return normalizedLead
    })
    .filter((lead): lead is Lead => Boolean(lead))
    .filter((lead) => lead.confidence >= campaign.minConfidence && !isBlockedDomain(extractDomain(lead.organizationWebsite)))
    .filter((lead) => campaign.id !== 'dogeday_2026_sponsorship' || Boolean(lead.relationshipType))
    .filter((lead) => !isBlockedResult({ title: lead.organizationName, description: lead.reasonForFit, url: lead.organizationWebsite }))
    .filter((lead) => !matchesExcludedLead(lead, excludedTerms))
    .filter((lead) => isCampaignResultEligible({ title: lead.organizationName, description: lead.reasonForFit, url: lead.sourceUrl || lead.organizationWebsite }, campaign))

  return dedupeLeadsByOrganization(qualified).slice(0, input.maxLeads ?? 14)
}

function extractExcludedClientTerms(input: LeadDiscoveryInput) {
  const text = input.goal
  const terms = new Set<string>()
  const patterns = [
    /past clients?\s*(?:are|is|:)?\s*([^.;\n]+)/gi,
    /existing clients?\s*(?:are|is|:)?\s*([^.;\n]+)/gi,
    /previous clients?\s*(?:are|is|:)?\s*([^.;\n]+)/gi,
    /already (?:worked|partnered) with\s*([^.;\n]+)/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] || ''
      raw
        .split(/,| and |&|\betc\b/gi)
        .map((term) => normalizeExcludedTerm(term))
        .filter((term) => term.length >= 3)
        .forEach((term) => terms.add(term))
    }
  }

  return [...terms]
}

function normalizeExcludedTerm(term: string) {
  return term
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]+/g, ' ')
    .trim()
}

function matchesExcludedClient(result: BraveResult, excludedTerms: string[]) {
  if (excludedTerms.length === 0) return false
  const text = normalizeExcludedTerm(`${result.title || ''} ${result.description || ''} ${result.url || ''}`)
  return excludedTerms.some((term) => {
    const domainStem = term.split('.')[0]
    return text.includes(term) || (domainStem.length >= 3 && text.includes(domainStem))
  })
}

function matchesExcludedLead(lead: Lead, excludedTerms: string[]) {
  return matchesExcludedClient({
    title: lead.organizationName,
    description: lead.reasonForFit,
    url: lead.organizationWebsite,
  }, excludedTerms)
}

function normalizeDogeDayRelationshipType(value: unknown, candidate: BraveResult) {
  const supplied = String(value || '').trim().toLowerCase()
  if (['cash_sponsor', 'activation_partner', 'media_partner'].includes(supplied)) {
    const deterministic = dogeDayRelationshipType(candidate)
    return deterministic === 'reject' ? undefined : deterministic
  }
  const inferred = dogeDayRelationshipType(candidate)
  return inferred === 'reject' ? undefined : inferred
}

function dogeDayReason(result: BraveResult, relationshipType?: LeadRelationshipType) {
  const description = (result.description || '').replace(/\s+/g, ' ').trim()
  const evidence = description || `${canonicalOrganizationDomain(result.url || '')} の公開ページを確認しました。`
  if (relationshipType === 'media_partner') {
    return `メディア提携候補（現金スポンサー候補ではありません）。公開ページでは ${evidence}`
  }
  if (relationshipType === 'activation_partner') {
    return `企画・アクティベーション協力候補。公開ページでは ${evidence}`
  }
  return `現金スポンサー候補。公開ページでは ${evidence}`
}

function dedupeLeadsByOrganization(leads: Lead[]) {
  const seen = new Set<string>()
  return leads.filter((lead) => {
    const domain = canonicalOrganizationDomain(lead.organizationWebsite || lead.sourceUrl)
    const name = normalizeExcludedTerm(lead.organizationName)
    const key = domain || name
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function discoverContacts(leads: Lead[], keys: RuntimeKeys, campaign: LeadCampaign = DEFAULT_CAMPAIGN) {
  if (!keys.hunterApiKey) return discoverPublicContacts(leads, campaign)

  const contacts: Contact[] = []
  const warnings: string[] = []

  for (const lead of leads) {
    const domain = extractDomain(lead.organizationWebsite)
    if (!domain) continue

    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain.replace(/^www\./, ''))
    url.searchParams.set('api_key', keys.hunterApiKey)
    url.searchParams.set('limit', '5')

    const response = await fetch(url)
    if (!response.ok) {
      warnings.push(`Hunter Domain Search failed for ${domain} with ${response.status}.`)
      continue
    }

    const data = (await response.json()) as HunterDomainResponse
    const emails = (data.data?.emails || []).filter((email) => email.value).slice(0, 3)

    for (const email of emails) {
      const verified = await verifyHunterEmail(email.value || '', keys)
      const contact: Contact = {
        id: crypto.randomUUID(),
        leadId: lead.id,
        name: [email.first_name, email.last_name].filter(Boolean).join(' ') || 'Unknown contact',
        title: email.position || 'Relevant business contact',
        email: email.value || '',
        emailStatus: verified.status,
        linkedinUrl: email.linkedin || '',
        sourceUrl: email.sources?.[0]?.uri || `https://hunter.io/search/${domain}`,
        confidence: clampConfidence((verified.score || email.confidence || 50) / 100),
      }
      if (isCampaignContactEligible(contact, campaign)) contacts.push(contact)
    }
  }

  return { contacts, warnings }
}

async function discoverPublicContacts(leads: Lead[], campaign: LeadCampaign = DEFAULT_CAMPAIGN) {
  const contacts: Contact[] = []
  const warnings: string[] = []

  for (const lead of leads.slice(0, 8)) {
    const pages = contactPageUrls(lead.organizationWebsite, lead.sourceUrl)
    const found = new Map<string, { sourceUrl: string; verified: boolean }>()

    for (const pageUrl of pages) {
      try {
        const response = await fetchWithTimeout(pageUrl, {
          redirect: 'follow',
          headers: {
            Accept: 'text/html,text/plain',
            'User-Agent': 'SayOKLeadDiscovery/1.0',
          },
        }, 5000)
        if (!response.ok) continue
        const text = await response.text()
        for (const email of extractEmails(text)) {
          if (isBlockedEmail(email)) continue
          if (!found.has(email)) found.set(email, { sourceUrl: response.url || pageUrl, verified: false })
        }
      } catch {
        continue
      }
    }

    for (const [email, meta] of found) {
      const verified = await hasMxRecord(email)
      const contact: Contact = {
        id: crypto.randomUUID(),
        leadId: lead.id,
        name: 'Public contact',
        title: inferContactTitle(email),
        email,
        emailStatus: verified ? 'verified' : 'found',
        linkedinUrl: '',
        sourceUrl: meta.sourceUrl,
        confidence: verified ? 0.75 : 0.55,
      }
      if (isCampaignContactEligible(contact, campaign)) contacts.push(contact)
    }
  }

  return { contacts, warnings }
}

function contactPageUrls(homepage: string, sourceUrl?: string) {
  try {
    const url = new URL(homepage)
    const origin = url.origin
    const urls = [
      origin,
      sourceUrl || '',
      `${origin}/contact`,
      `${origin}/contact-us`,
      `${origin}/about`,
      `${origin}/privacy`,
      `${origin}/privacy-policy`,
      `${origin}/privacypolicy`,
    ].filter(Boolean)
    return [...new Set(urls)]
  } catch {
    return []
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function extractEmails(text: string) {
  const normalized = decodeHtml(text)
    .replace(/\s+\[at\]\s+/gi, '@')
    .replace(/\s+\(at\)\s+/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+\[dot\]\s+/gi, '.')
    .replace(/\s+\(dot\)\s+/gi, '.')

  const matches = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  return [...new Set(matches.map((email) => email.toLowerCase()))]
}

function isBlockedEmail(email: string) {
  const local = email.split('@')[0] || ''
  const domain = email.split('@')[1] || ''
  return (
    /\.(png|jpg|jpeg|gif|webp|svg)@/i.test(email) ||
    /@\S+\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email) ||
    /^(abuse|admin|careers?|compliance|copyright|devnull|donotreply|jobs?|legal|no-?reply|phishing|postmaster|privacy|report|security|support|webmaster)/i.test(local) ||
    /^[a-z]{1,3}\d{2,}$/i.test(local) ||
    /^(example|sample|test|yourname|youremail|your-email|name|email|user|usuario|seu|seunome|seuemail)$/i.test(local) ||
    email === 'user@domain.com' ||
    ['domain.com', 'email.com', 'example.org', 'example.net', 'sample.com', 'test.com'].includes(domain) ||
    email.includes('example.com') ||
    email.includes('test.com') ||
    email.includes('sentry.io') ||
    domain === 'mofa.go.jp' ||
    domain.endsWith('.mofa.go.jp')
  )
}

async function hasMxRecord(email: string) {
  const domain = email.split('@')[1]
  if (!domain) return false
  try {
    const records = await dns.resolveMx(domain)
    return records.length > 0
  } catch {
    return false
  }
}

function inferContactTitle(email: string) {
  const local = email.split('@')[0]
  if (/admission|student|program/.test(local)) return 'Program contact'
  if (/partner|business|bd/.test(local)) return 'Partnership contact'
  if (/sales/.test(local)) return 'Sales contact'
  if (/info|hello|contact/.test(local)) return 'General contact'
  return 'Public contact'
}

function isCampaignContactEligible(contact: Contact, campaign: LeadCampaign) {
  if (campaign.id !== 'dogeday_2026_sponsorship') return true
  const local = contact.email.split('@')[0]?.toLowerCase() || ''
  const title = contact.title.toLowerCase()
  const text = `${local} ${title}`
  if (/editor|editorial|journalist|reporter|newsroom|press|writer|author|customer support|security/.test(text)) return false
  if (/partner|sponsor|brand|marketing|advertis|commercial|business development|bizdev|community|event|growth/.test(text)) return true
  return /^(info|hello|contact|business|partnerships?|marketing|sponsorships?)$/.test(local)
}

async function verifyHunterEmail(email: string, keys: RuntimeKeys): Promise<{ status: Contact['emailStatus']; score: number }> {
  if (!email) return { status: 'not_found', score: 0 }

  const url = new URL('https://api.hunter.io/v2/email-verifier')
  url.searchParams.set('email', email)
  url.searchParams.set('api_key', keys.hunterApiKey)

  const response = await fetch(url)
  if (!response.ok) return { status: 'found', score: 50 }

  const data = (await response.json()) as HunterVerifyResponse
  const result = data.data?.result
  return {
    status: result === 'deliverable' ? 'verified' : 'found',
    score: data.data?.score || 50,
  }
}

async function discoverApolloContacts(leads: Lead[], keys: RuntimeKeys) {
  if (!keys.apolloApiKey) return { contacts: [] as Contact[], warning: '' }

  const contacts: Contact[] = []

  try {
    for (const lead of leads.slice(0, 5)) {
      const domain = extractDomain(lead.organizationWebsite)?.replace(/^www\./, '')
      if (!domain) continue

      const response = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': keys.apolloApiKey,
        },
        body: JSON.stringify({
          q_organization_domains: domain,
          page: 1,
          per_page: 3,
          person_titles: ['Founder', 'Head of Partnerships', 'Business Development Manager', 'Marketing Director'],
        }),
      })

      if (!response.ok) throw new Error(`Apollo returned ${response.status}`)
      const data = (await response.json()) as { people?: Record<string, unknown>[] }
      for (const person of data.people || []) {
        const email = String(person.email || '')
        contacts.push({
          id: crypto.randomUUID(),
          leadId: lead.id,
          name: String(person.name || 'Unknown contact'),
          title: String(person.title || 'Relevant business contact'),
          email,
          emailStatus: email ? 'found' : 'not_found',
          linkedinUrl: String(person.linkedin_url || ''),
          sourceUrl: 'https://apollo.io',
          confidence: 0.65,
        })
      }
    }

    return { contacts, warning: '' }
  } catch (error) {
    return {
      contacts,
      warning: `Apollo is optional and could not be completed: ${error instanceof Error ? error.message : 'unknown error'}.`,
    }
  }
}

function mergeContacts(contacts: Contact[]) {
  const seen = new Set<string>()
  const merged: Contact[] = []

  for (const contact of contacts) {
    const key = `${contact.leadId}:${contact.email || contact.linkedinUrl || contact.name}:${contact.title}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(contact)
  }

  return merged
}

function prioritizeContacts(contacts: Contact[], campaign: LeadCampaign = DEFAULT_CAMPAIGN) {
  const byLead = new Map<string, Contact[]>()
  for (const contact of contacts) {
    byLead.set(contact.leadId, [...(byLead.get(contact.leadId) || []), contact])
  }

  return [...byLead.values()].flatMap((leadContacts) => (
    leadContacts
      .filter((contact) => isCampaignContactEligible(contact, campaign))
      .sort((a, b) => contactScore(b) - contactScore(a))
      .slice(0, 2)
  ))
}

function contactScore(contact: Contact) {
  const email = contact.email.toLowerCase()
  const local = email.split('@')[0] || ''
  let score = contact.confidence
  if (contact.emailStatus === 'verified') score += 0.5
  if (/^(info|contact|hello|program|admissions?|outreach|partnerships?|ealaccommunications|communications?)$/.test(local)) score += 0.6
  if (/communications?|program|admissions?|partnership/.test(contact.title.toLowerCase())) score += 0.2
  if (/^[a-z]{1,4}\d+/.test(local)) score -= 0.8
  if (/personal|event|phishing|career|job/.test(contact.sourceUrl.toLowerCase())) score -= 0.5
  return score
}

function applyLeadStatuses(leads: Lead[], contacts: Contact[]) {
  return leads.map((lead) => {
    const leadContacts = contacts.filter((contact) => contact.leadId === lead.id)
    const hasEmail = leadContacts.some((contact) => contact.email && contact.emailStatus !== 'not_found')
    return {
      ...lead,
      status: hasEmail ? ('email_found' as LeadStatus) : leadContacts.length > 0 ? ('contact_found' as LeadStatus) : lead.status,
    }
  })
}

function prioritizeActionableLeads(
  leads: Lead[],
  contacts: Contact[],
  input: LeadDiscoveryInput,
  campaign: LeadCampaign = DEFAULT_CAMPAIGN,
) {
  const contactLeadIds = new Set(
    contacts
      .filter((contact) => contact.email && contact.emailStatus !== 'not_found')
      .map((contact) => contact.leadId),
  )
  const excludedTerms = [...new Set([...extractExcludedClientTerms(input), ...campaign.excludedTerms])]
  const usable = dedupeLeadsByOrganization(leads
    .filter((lead) => !isBlockedResult({
      title: lead.organizationName,
      description: lead.reasonForFit,
      url: lead.organizationWebsite,
    }))
    .filter((lead) => isResultInTargetMarket({
      title: lead.organizationName,
      description: lead.reasonForFit,
      url: lead.sourceUrl || lead.organizationWebsite,
    }, input.targetMarket))
    .filter((lead) => !matchesExcludedLead(lead, excludedTerms))
    .filter((lead) => lead.confidence >= campaign.minConfidence)
    .filter((lead) => isCampaignResultEligible({
      title: lead.organizationName,
      description: lead.reasonForFit,
      url: lead.sourceUrl || lead.organizationWebsite,
    }, campaign)))

  const sorted = usable
    .sort((a, b) => {
      const relationshipDelta = dogeDayRelationshipRank(b.relationshipType) - dogeDayRelationshipRank(a.relationshipType)
      if (relationshipDelta !== 0) return relationshipDelta
      const aHasContact = contactLeadIds.has(a.id) ? 1 : 0
      const bHasContact = contactLeadIds.has(b.id) ? 1 : 0
      if (aHasContact !== bHasContact) return bHasContact - aHasContact
      return b.confidence - a.confidence
    })

  if (campaign.id !== 'dogeday_2026_sponsorship') {
    return sorted.slice(0, Math.min(input.maxLeads ?? 12, 14))
  }

  let mediaPartners = 0
  return sorted
    .filter((lead) => {
      if (lead.relationshipType !== 'media_partner') return true
      mediaPartners += 1
      return mediaPartners <= 1
    })
    .slice(0, Math.min(input.maxLeads ?? 12, 14))
}

function dogeDayRelationshipRank(value?: LeadRelationshipType) {
  if (value === 'cash_sponsor') return 3
  if (value === 'activation_partner') return 2
  if (value === 'media_partner') return 1
  return 0
}

async function generateOutreach(
  input: LeadDiscoveryInput,
  analysis: WebsiteAnalysis,
  website: { title: string; content: string },
  leads: Lead[],
  contacts: Contact[],
  keys: RuntimeKeys,
): Promise<OutreachMessage[]> {
  type OutreachRow = {
    contact: Contact | null
    lead: Lead
    suggestedContactPath?: string
  }

  const contactRows: OutreachRow[] = contacts
    .filter((contact) => contact.email && contact.emailStatus !== 'not_found')
    .slice(0, 20)
    .flatMap((contact) => {
      const lead = leads.find((candidate) => candidate.id === contact.leadId)
      return lead ? [{ contact, lead }] : []
    })

  const contactLeadIds = new Set(contactRows.map((row) => row.lead?.id).filter(Boolean))
  const leadRowsWithoutContact = leads
    .filter((lead) => !contactLeadIds.has(lead.id))
    .slice(0, 12)
    .map((lead) => ({
      contact: null,
      lead,
      suggestedContactPath: suggestContactPath(input, lead),
    }))

  const outreachRows = [...contactRows, ...leadRowsWithoutContact].slice(0, 16)

  if (outreachRows.length === 0) return []

  return buildFallbackOutreach(input, analysis, website, outreachRows)
}

function buildFallbackOutreach(
  input: LeadDiscoveryInput,
  analysis: WebsiteAnalysis,
  website: { title: string; content: string },
  rows: { contact: Contact | null; lead: Lead; suggestedContactPath?: string }[],
): OutreachMessage[] {
  const facts = buildOfferFacts(website.content)

  return rows.slice(0, 12).map(({ contact, lead }) => {
    const recipient = contact?.name && contact.name !== 'Public contact' ? contact.name : 'team'
    const contactId = contact?.id || `${lead.id}:no-contact`
    const subject = `Partnership idea for ${lead.organizationName}`

    const email = input.outreachTemplate?.trim()
      ? personalizeOutreachTemplate(input.outreachTemplate, lead, analysis)
      : `Hi ${recipient},\n\nI’m reaching out from ${analysis.product}. ${facts[0]}\n\n${lead.organizationName} stood out because ${lead.reasonForFit.charAt(0).toLowerCase()}${lead.reasonForFit.slice(1)}.\n\nI wanted to ask whether this could be useful for your audience, members, customers, or students. If relevant, we can make the first step very low-friction and adapt the offer around your needs.\n\nWould you be open to a short call next week to see if there is a practical fit?`

    return {
      leadId: lead.id,
      contactId,
      subject,
      email,
      linkedin: `Hi ${recipient}, I’m with ${analysis.product}. I had a partnership idea for ${lead.organizationName} and wanted to ask who handles partnerships on your side. Worth a quick note?`,
      whatsapp: `Hi ${recipient}, quick question. Who is best to contact at ${lead.organizationName} about a possible partnership?`,
      followUp: `Hi ${recipient}, just following up on this. If you are not the right person for partnerships, could you point me to the right team? Happy to send a shorter overview.`,
    }
  })
}

function personalizeOutreachTemplate(template: string, lead: Lead, analysis: WebsiteAnalysis) {
  const organization = lead.organizationName
  const reason = lead.reasonForFit
  return template
    .replaceAll('{{organization}}', organization)
    .replaceAll('{{company}}', organization)
    .replaceAll('{{reason}}', reason)
    .replaceAll('{{product}}', analysis.product)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function suggestContactPath(input: LeadDiscoveryInput, lead: Lead) {
  const text = `${input.goal} ${lead.category} ${lead.reasonForFit}`.toLowerCase()
  if (/ip|license|licensing|nft|crypto|web3|wallet|exchange|collectible/.test(text)) {
    return 'Best path: Head of Partnerships, Business Development, Licensing, Brand Partnerships, Community/Growth, or Founder. Ask who handles licensing or partnership campaigns.'
  }
  if (/university|school|student|language|program|club/.test(text)) {
    return 'Best path: Program Director, Department Coordinator, Club President, Study Abroad Director, or Community/Events Lead.'
  }
  if (/distributor|retail|wholesale|reseller/.test(text)) {
    return 'Best path: Founder, Head of Sales, Buyer, Import Manager, Distribution Manager, or Partnerships lead.'
  }
  return 'Best path: Founder, Head of Partnerships, Business Development Manager, Marketing Director, or relevant program/team lead.'
}

function buildOfferFacts(content: string) {
  const text = content.toLowerCase()
  const facts: string[] = []
  if (/private|one-on-one|1-on-1|native japanese teachers?/.test(text)) {
    facts.push('Private online Japanese lessons with native Japanese teachers for conversation, JLPT, travel, work, and business Japanese.')
  }
  if (/group lessons|class and group lessons|classroom|study group|clubs?|companies/.test(text)) {
    facts.push('Group/class lessons are available for classrooms, study groups, companies, clubs, and other organizations.')
  }
  if (/finding japanese school|support your life in japan|finding job in japan|japanese email support|japanese telephone assistance/.test(text)) {
    facts.push('The service also offers Japan-side support such as finding Japanese schools and support for life in Japan.')
  }
  if (/free trial|trial lesson/.test(text)) {
    facts.push('Students can start with a free trial lesson.')
  }
  return facts.length > 0 ? facts : ['Online Japanese lessons with native Japanese teachers.']
}

async function callClaude(prompt: string, maxTokens: number, keys: RuntimeKeys) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': keys.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) throw new Error(`LLM request failed with ${response.status}.`)
  const data = (await response.json()) as { content?: { text?: string }[] }
  return data.content?.map((part) => part.text || '').join('') || ''
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const json = cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)
  return JSON.parse(json) as T
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function extractDomain(rawUrl: string) {
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    return url.hostname.toLowerCase()
  } catch {
    return ''
  }
}

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  'ac.jp',
  'co.jp',
  'go.jp',
  'ne.jp',
  'or.jp',
  'co.uk',
  'org.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.br',
  'com.sg',
])

function canonicalOrganizationDomain(rawUrl: string) {
  const host = extractDomain(rawUrl).replace(/^www\./, '')
  if (!host) return ''
  const labels = host.split('.').filter(Boolean)
  if (labels.length <= 2 || /^\d+(?:\.\d+){3}$/.test(host)) return host
  const suffix = labels.slice(-2).join('.')
  return MULTI_LABEL_PUBLIC_SUFFIXES.has(suffix)
    ? labels.slice(-3).join('.')
    : labels.slice(-2).join('.')
}

function normalizeHomepage(rawUrl: string) {
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    const domain = canonicalOrganizationDomain(url.hostname)
    return `${url.protocol}//${domain || url.hostname}`
  } catch {
    return rawUrl
  }
}

function clampConfidence(value: number) {
  if (Number.isNaN(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function cleanTitle(title: string) {
  let cleaned = title
    .replace(/\s+\|.*$/, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length % 2 === 0) {
    const middle = parts.length / 2
    const first = parts.slice(0, middle).join(' ').toLowerCase()
    const second = parts.slice(middle).join(' ').toLowerCase()
    if (first === second) cleaned = parts.slice(0, middle).join(' ')
  }
  const companyParts = cleaned
    .split(/[：:｜|]/)
    .map((part) => part.trim())
    .filter((part) => /株式会社|合同会社|有限会社|一般社団法人|公益社団法人/.test(part))
    .sort((a, b) => a.length - b.length)
  return companyParts[0] || cleaned
}
