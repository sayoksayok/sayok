import { promises as dns } from 'dns'
import { isIP } from 'net'
import { NextRequest, NextResponse } from 'next/server'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'

export const maxDuration = 45

type SiteAnalysis = {
  company: string
  offering: string
  valueProp: string
  idealCustomerProfile: string[]
  searchKeywords: string[]
}

export async function POST(request: NextRequest) {
  const auth = await requireSalesAgentUser(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = (await request.json()) as { websiteUrl?: string }
    const websiteUrl = body.websiteUrl?.trim() || ''
    const url = await validatePublicUrl(websiteUrl)
    const website = await readWebsite(url)
    const fallback = buildFallback(url, website.title, website.description)
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json({ analysis: fallback, source: 'website' })
    }

    const prompt = `You are a concise B2B sales researcher. Analyze the supplied website content.

Website URL: ${url.href}
Website title: ${website.title}
Website description: ${website.description}
Website content:
${website.content}

Rules:
- Use only facts supported by the supplied website content.
- Do not invent customers, traction, pricing, or capabilities.
- Describe practical buyer categories, not vague personas.
- Return only valid JSON with no markdown.

Return:
{
  "company": "company or service name",
  "offering": "what it sells in one or two sentences",
  "valueProp": "why a customer would care in one sentence",
  "idealCustomerProfile": ["3 to 5 specific buyer categories"],
  "searchKeywords": ["4 to 6 concrete search phrases for finding those buyers"]
}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ analysis: fallback, source: 'website' })
    }

    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
    const raw = data.content?.find((item) => item.type === 'text')?.text || ''
    const parsed = parseJson<Partial<SiteAnalysis>>(raw)
    const analysis: SiteAnalysis = {
      company: cleanText(parsed.company) || fallback.company,
      offering: cleanText(parsed.offering) || fallback.offering,
      valueProp: cleanText(parsed.valueProp) || fallback.valueProp,
      idealCustomerProfile: cleanList(parsed.idealCustomerProfile, fallback.idealCustomerProfile),
      searchKeywords: cleanList(parsed.searchKeywords, fallback.searchKeywords),
    }

    return NextResponse.json({ analysis, source: 'anthropic' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'サイトを分析できませんでした。'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

async function validatePublicUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('正しいウェブサイトURLを入力してください。')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('URLは http:// または https:// で始めてください。')
  }

  const host = url.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local')) {
    throw new Error('公開されているウェブサイトURLを入力してください。')
  }

  if (isPrivateAddress(host)) {
    throw new Error('プライベートネットワークのURLは読み込めません。')
  }

  try {
    const records = await dns.lookup(host, { all: true })
    if (records.some((record) => isPrivateAddress(record.address))) {
      throw new Error('プライベートネットワークのURLは読み込めません。')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('プライベートネットワーク')) throw error
    throw new Error('ウェブサイトのドメインを確認できませんでした。')
  }

  return url
}

function isPrivateAddress(value: string) {
  const normalized = value.replace(/^\[|\]$/g, '')
  if (!isIP(normalized)) return false
  if (normalized === '::1' || normalized === '0.0.0.0') return true
  if (normalized.startsWith('10.') || normalized.startsWith('127.') || normalized.startsWith('169.254.')) return true
  if (normalized.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return true
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(normalized.replaceAll(':', ''))) return true
  return false
}

async function readWebsite(url: URL) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'SayOKSalesAgent/1.0',
    },
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) throw new Error(`サイトを読み込めませんでした (${response.status})。`)

  const html = await response.text()
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/\s+/g, ' ')
    .trim()
  const description = decodeHtml(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]
      || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]
      || '',
  ).replace(/\s+/g, ' ').trim()

  return {
    title,
    description,
    content: htmlToText(html).slice(0, 18000),
  }
}

function buildFallback(url: URL, title: string, description: string): SiteAnalysis {
  const company = title.split(/[|–—-]/)[0]?.trim() || url.hostname.replace(/^www\./, '')
  const offering = description || `Website operated by ${company}.`
  return {
    company,
    offering,
    valueProp: description || 'サイト内容を確認して、顧客にとっての価値を編集してください。',
    idealCustomerProfile: ['この商品を購入する具体的な企業・団体', '課題が顕在化している担当部署', '提携により顧客へ価値を届けられる組織'],
    searchKeywords: [`${company} customer`, `${company} partner`, `${offering.slice(0, 80)} buyer`],
  }
}

function parseJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim()
  const first = clean.indexOf('{')
  const last = clean.lastIndexOf('}')
  if (first < 0 || last <= first) throw new Error('AI response was not JSON.')
  return JSON.parse(clean.slice(first, last + 1)) as T
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 1200) : ''
}

function cleanList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const items = value.map(cleanText).filter(Boolean).slice(0, 8)
  return items.length ? items : fallback
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
}

function decodeHtml(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
}
