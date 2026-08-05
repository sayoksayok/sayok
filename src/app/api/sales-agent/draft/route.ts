import { NextRequest, NextResponse } from 'next/server'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'

export const maxDuration = 45

type DraftInput = {
  company?: string
  website?: string
  reason?: string
  evidence?: string
  contactTitle?: string
  senderName?: string
  senderCompany?: string
  offering?: string
  valueProp?: string
  serviceNote?: string
  senderWebsite?: string
  salesDeckUrl?: string
  attachLooqDeck?: boolean
  tone?: string
  language?: 'English' | 'Japanese'
}

type DraftResult = {
  subject: string
  body: string
}

export async function POST(request: NextRequest) {
  const auth = await requireSalesAgentUser(request)
  if (auth instanceof NextResponse) return auth

  try {
    const input = (await request.json()) as DraftInput
    if (!input.company || !input.offering || !input.senderName || !input.senderCompany) {
      return NextResponse.json({ error: '会社名・商材・差出人情報が必要です。' }, { status: 400 })
    }
    input.attachLooqDeck = input.attachLooqDeck === true && Boolean(auth.user.email?.toLowerCase().endsWith('@looq.icu'))
    const dogeDayCampaign = isDogeDayDraft(input, auth.user.email || '')

    const fallback = withSalesCollateral(fallbackDraft(input, dogeDayCampaign), input)
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ draft: fallback, source: 'fallback' })

    const prompt = `You are an experienced B2B business development operator. Write one personalized first-contact email.

Sender: ${input.senderName} from ${input.senderCompany}
What the sender sells: ${input.offering}
Customer value: ${input.valueProp || 'unknown'}
Additional offer details: ${input.serviceNote || 'none'}
Sender website: ${input.senderWebsite || 'none'}
Service deck URL: ${input.salesDeckUrl || 'none'}
LOOQ PDF attachment enabled: ${input.attachLooqDeck === true ? 'yes' : 'no'}
Recipient organization: ${input.company}
Recipient website: ${input.website || 'unknown'}
Best contact role: ${input.contactTitle || 'public business contact'}
Why this organization may fit: ${input.reason || 'unknown'}
Evidence from the public source: ${input.evidence || 'unknown'}
Language: ${input.language || 'English'}
Tone: ${input.tone || 'professional, concise, and human'}
Campaign context: ${dogeDayCampaign
  ? `This is DOGE DAY 2026 sponsorship outreach by Own The Doge. Own The Doge is the steward of the original Doge IP and holds an exclusive license from Atsuko Sato to use the original Doge image. The event in Japan is built around Kabosu's birthday and the global Doge community, with community experiences, internet-culture guests, VIP networking, media moments, and sponsor activations. Available collaboration formats include brand activations, media placement, speaking, merchandise, and digital collectibles. Use these facts selectively; do not dump the whole deck into the email.`
  : 'No special campaign context.'}

Rules:
- Use only the supplied facts. Never invent clients, metrics, familiarity, or prior conversations.
- Personalize the opening using the provided public evidence.
- Explain one specific, plausible value for this organization.
- ${dogeDayCampaign ? 'Frame this as a tailored partnership conversation, not a generic sponsorship blast. Connect one verified recipient fact to one relevant DOGE DAY activation and ask who owns brand partnerships, community, or sponsorships.' : 'Keep the proposal relevant to the recipient evidence.'}
- Keep the body between 120 and 190 words in English, or 250 and 420 Japanese characters.
- Ask for one low-friction next step.
- Include the sender website near the end only when one is provided.
- Include the service deck URL near the end only when one is provided.
- State that LOOQ_pitchdeck_JP.pdf is attached only when attachment is enabled.
- Do not include a signature or legal footer.
- Avoid hype, flattery, and generic sales language.
- Return only JSON: {"subject":"...","body":"..."}`

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
    const draft = withSalesCollateral(parseDraft(raw), input)
    if (!draft.body || !draft.subject) return NextResponse.json({ draft: fallback, source: 'fallback' })
    return NextResponse.json({ draft, source: 'anthropic' })
  } catch {
    return NextResponse.json({ error: '文面を作成できませんでした。' }, { status: 500 })
  }
}

function withSalesCollateral(draft: DraftResult, input: DraftInput): DraftResult {
  if (!draft.body) return draft
  const language = input.language || 'English'
  const website = publicUrl(input.senderWebsite)
  const deckUrl = publicUrl(input.salesDeckUrl)
  const websiteLine = language === 'Japanese'
    ? `${input.senderCompany} ウェブサイト：\n${website}`
    : `${input.senderCompany} website:\n${website}`
  const attachmentLine = language === 'Japanese'
    ? 'サービス資料「LOOQ_pitchdeck_JP.pdf」も添付しておりますので、あわせてご覧ください。'
    : 'I have also attached our service deck, LOOQ_pitchdeck_JP.pdf, for reference.'
  const driveLine = language === 'Japanese'
    ? `サービス資料：\n${deckUrl}`
    : `Service deck:\n${deckUrl}`
  const additions = [
    website && !draft.body.includes(website) ? websiteLine : '',
    deckUrl && !draft.body.includes(deckUrl) ? driveLine : '',
    input.attachLooqDeck === true && !draft.body.includes('LOOQ_pitchdeck_JP.pdf') ? attachmentLine : '',
  ].filter(Boolean)
  return {
    ...draft,
    body: additions.length ? `${draft.body}\n\n${additions.join('\n\n')}` : draft.body,
  }
}

function publicUrl(value?: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname !== 'localhost' ? url.toString() : ''
  } catch {
    return ''
  }
}

function parseDraft(raw: string): DraftResult {
  const clean = raw.replace(/```json|```/g, '').trim()
  const first = clean.indexOf('{')
  const last = clean.lastIndexOf('}')
  if (first < 0 || last <= first) return { subject: '', body: '' }
  try {
    const parsed = JSON.parse(clean.slice(first, last + 1)) as Partial<DraftResult>
    return {
      subject: String(parsed.subject || '').trim().slice(0, 180),
      body: String(parsed.body || '').trim().slice(0, 6000),
    }
  } catch {
    return { subject: '', body: '' }
  }
}

function fallbackDraft(input: DraftInput, dogeDayCampaign = false): DraftResult {
  const recipient = input.company || 'your team'
  const safeReason = getUsableReason(input.reason)
  const value = input.valueProp && input.valueProp !== input.offering ? input.valueProp : ''
  const offerDetail = input.serviceNote?.trim() || ''

  if (input.language === 'Japanese') {
    const offering = hasJapanese(input.offering) ? input.offering : '弊社サービス'
    const localizedValue = hasJapanese(value) ? value : ''
    return {
      subject: `${recipient}様へのご提案`,
      body: `${recipient} ご担当者様\n\n突然のご連絡失礼いたします。${input.senderCompany}の${input.senderName}と申します。\n\n${safeReason && hasJapanese(safeReason) ? `${safeReason}と考え、ご連絡しました。` : '貴社の公開情報を拝見し、弊社のサービスがお役に立てる可能性があると考えご連絡しました。'}\n\n弊社は${offering}を提供しています。${localizedValue}${offerDetail ? ` 具体的には、${offerDetail}が可能です。` : ''}\n\nまずは15分ほど、現在のお取り組みや課題について情報交換できないでしょうか。ご担当が別の方でしたら、適切な窓口をご教示いただけますと幸いです。`,
    }
  }

  if (dogeDayCampaign) {
    return {
      subject: `DOGE DAY 2026 partnership idea for ${recipient}`,
      body: `Hi,

I am ${input.senderName} from ${input.senderCompany}, the steward of the original Doge IP.

${safeReason || `I came across ${recipient} and saw a possible fit with your community and brand-partnership work.`}

We are preparing DOGE DAY 2026 in Japan around Kabosu's birthday and the global Doge community. The program combines community experiences, internet-culture guests, VIP networking, media moments, and brand activations. For ${recipient}, we would like to explore one relevant activation rather than send a generic sponsorship package.

Would you be open to a short call to see whether this fits your 2026 partnership priorities? If someone else owns sponsorships, community, or brand partnerships, I would appreciate a pointer to the right person.`,
    }
  }

  return {
    subject: `A practical idea for ${recipient}`,
    body: `Hi,\n\nI am ${input.senderName} from ${input.senderCompany}.\n\n${safeReason || `I came across ${recipient} and saw a possible fit with your work.`}\n\nWe provide ${input.offering}.${value ? ` ${value}` : ''}${offerDetail ? ` We can also support ${offerDetail}.` : ''}\n\nWould you be open to a brief 15-minute conversation to see whether this could be useful for your team? If someone else owns this area, I would appreciate a pointer to the right person.`,
  }
}

function isDogeDayDraft(input: DraftInput, userEmail: string) {
  if (userEmail.trim().toLowerCase() !== 'dogejapan@ownthedoge.com') return false
  const text = `${input.senderCompany || ''} ${input.offering || ''} ${input.serviceNote || ''} ${input.salesDeckUrl || ''}`.toLowerCase()
  return /own\s*the\s*doge|doge\s*day|dogeday/.test(text)
}

function getUsableReason(reason?: string) {
  const clean = reason?.replace(/\s+/g, ' ').trim() || ''
  if (!clean || /^matched (a )?real web result/i.test(clean) || clean.length > 420) return ''
  return clean.replace(/[.!?。！？]+$/, '')
}

function hasJapanese(value?: string) {
  return /[ぁ-んァ-ヶ一-龠]/u.test(value || '')
}
