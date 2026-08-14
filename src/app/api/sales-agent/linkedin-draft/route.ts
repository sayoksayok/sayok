import { NextRequest, NextResponse } from 'next/server'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'

type Input = {
  product?: 'DOGEDAY' | 'ALTLIER' | 'LOOQ'
  company?: string
  website?: string
  reason?: string
  contactName?: string
  contactTitle?: string
  profileText?: string
  senderName?: string
  senderCompany?: string
  offering?: string
  serviceNote?: string
  language?: 'English' | 'Japanese'
}

type LinkedInDraft = {
  connectionNote: string
  firstMessage: string
  followUp: string
}

export const maxDuration = 45

export async function POST(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  try {
    const input = (await request.json()) as Input
    const company = clean(input.company, 240)
    const senderName = clean(input.senderName, 120)
    const senderCompany = clean(input.senderCompany, 180)
    if (!company || !senderName || !senderCompany) {
      return NextResponse.json({ error: '会社名と差出人情報が必要です。' }, { status: 400 })
    }

    const fallback = fallbackDraft({ ...input, company, senderName, senderCompany })
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ draft: fallback, source: 'fallback' })

    const language = input.language === 'Japanese' ? 'Japanese' : 'English'
    const prompt = `You are SayOK, a practical founder-led sales operator. Prepare LinkedIn outreach for one real prospect.

Campaign: ${clean(input.product, 40) || 'unknown'}
Sender: ${senderName} from ${senderCompany}
Offer: ${clean(input.offering, 800) || 'unknown'}
Offer details: ${clean(input.serviceNote, 1200) || 'none'}
Prospect company: ${company}
Company website: ${clean(input.website, 800) || 'unknown'}
Verified reason for fit: ${clean(input.reason, 1600) || 'unknown'}
Contact name: ${clean(input.contactName, 180) || 'unknown'}
Contact title: ${clean(input.contactTitle, 240) || 'unknown'}
User-pasted LinkedIn/profile context: ${clean(input.profileText, 3000) || 'none'}
Language: ${language}

Rules:
- Use only supplied facts. Do not claim that you viewed a profile unless profile context was supplied.
- Do not invent responsibilities, relationships, budgets, metrics, or interests.
- The connection note must fit LinkedIn's short connection-note use case and be at most 280 characters.
- The first message must be 55-110 words in English or 140-260 Japanese characters.
- The follow-up must be shorter than the first message and make one low-friction ask.
- Keep DOGEDAY, ALTLIER, and LOOQ evidence completely separate.
- Do not write spammy praise, hype, or multiple calls to action.
- Do not add a formal email signature.
- Return ONLY JSON with keys connectionNote, firstMessage, followUp.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) return NextResponse.json({ draft: fallback, source: 'fallback' })
    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
    const raw = data.content?.find((item) => item.type === 'text')?.text || ''
    const parsed = parseDraft(raw)
    if (!parsed) return NextResponse.json({ draft: fallback, source: 'fallback' })
    return NextResponse.json({ draft: normalizeDraft(parsed), source: 'anthropic' })
  } catch {
    return NextResponse.json({ error: 'LinkedIn文面を作成できませんでした。' }, { status: 500 })
  }
}

function fallbackDraft(input: Input & { company: string; senderName: string; senderCompany: string }): LinkedInDraft {
  const person = clean(input.contactName, 120)
  const opening = person ? `Hi ${person}` : `Hi ${input.company} team`
  const fit = usableReason(input.reason)
  if (input.language === 'Japanese') {
    return {
      connectionNote: `${input.company}でのお取り組みを拝見し、${input.senderCompany}の${input.senderName}よりご連絡しました。まずは情報交換できれば幸いです。`.slice(0, 280),
      firstMessage: `${person ? `${person}様` : `${input.company}ご担当者様`}、つながっていただきありがとうございます。${fit ? `${fit}と考え、` : ''}${input.senderCompany}の取り組みが貴社にお役立てできる可能性があると思いご連絡しました。まず15分ほど、現在のお取り組みについて情報交換できないでしょうか。`,
      followUp: `先日のご連絡のフォローです。ご担当が別の方でしたら、適切な窓口だけご教示いただけると助かります。`,
    }
  }
  return normalizeDraft({
    connectionNote: `Hi${person ? ` ${person}` : ''}, I am ${input.senderName} from ${input.senderCompany}. I saw a possible fit with ${input.company} and would value connecting.`,
    firstMessage: `${opening}, thanks for connecting. ${fit ? `${fit}. ` : ''}I am with ${input.senderCompany}, and I think there may be one practical way our work could support ${input.company}. Would you be open to a brief conversation, or could you point me to the person who owns this area?`,
    followUp: `Hi${person ? ` ${person}` : ''}, a quick follow-up in case this is relevant. I can send one concrete idea for ${input.company} rather than a broad proposal. Worth sharing?`,
  })
}

function parseDraft(raw: string): LinkedInDraft | null {
  const cleanText = raw.replace(/```json|```/g, '').trim()
  const first = cleanText.indexOf('{')
  const last = cleanText.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  try {
    const parsed = JSON.parse(cleanText.slice(first, last + 1)) as Partial<LinkedInDraft>
    if (!parsed.connectionNote || !parsed.firstMessage || !parsed.followUp) return null
    return {
      connectionNote: String(parsed.connectionNote),
      firstMessage: String(parsed.firstMessage),
      followUp: String(parsed.followUp),
    }
  } catch {
    return null
  }
}

function normalizeDraft(draft: LinkedInDraft): LinkedInDraft {
  return {
    connectionNote: draft.connectionNote.trim().slice(0, 280),
    firstMessage: draft.firstMessage.trim().slice(0, 1800),
    followUp: draft.followUp.trim().slice(0, 1200),
  }
}

function clean(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''
}

function usableReason(value?: string) {
  const reason = clean(value, 320)
  return /^matched|公式サイト|営業候補/i.test(reason) ? '' : reason.replace(/[.!?。！？]+$/, '')
}
