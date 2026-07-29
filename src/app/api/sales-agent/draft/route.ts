import { NextRequest, NextResponse } from 'next/server'

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
  tone?: string
  language?: 'English' | 'Japanese'
}

type DraftResult = {
  subject: string
  body: string
}

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as DraftInput
    if (!input.company || !input.offering || !input.senderName || !input.senderCompany) {
      return NextResponse.json({ error: '会社名・商材・差出人情報が必要です。' }, { status: 400 })
    }

    const fallback = fallbackDraft(input)
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ draft: fallback, source: 'fallback' })

    const prompt = `You are an experienced B2B business development operator. Write one personalized first-contact email.

Sender: ${input.senderName} from ${input.senderCompany}
What the sender sells: ${input.offering}
Customer value: ${input.valueProp || 'unknown'}
Additional offer details: ${input.serviceNote || 'none'}
Recipient organization: ${input.company}
Recipient website: ${input.website || 'unknown'}
Best contact role: ${input.contactTitle || 'public business contact'}
Why this organization may fit: ${input.reason || 'unknown'}
Evidence from the public source: ${input.evidence || 'unknown'}
Language: ${input.language || 'English'}
Tone: ${input.tone || 'professional, concise, and human'}

Rules:
- Use only the supplied facts. Never invent clients, metrics, familiarity, or prior conversations.
- Personalize the opening using the provided public evidence.
- Explain one specific, plausible value for this organization.
- Keep the body between 120 and 190 words in English, or 250 and 420 Japanese characters.
- Ask for one low-friction next step.
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
    const draft = parseDraft(raw)
    if (!draft.body || !draft.subject) return NextResponse.json({ draft: fallback, source: 'fallback' })
    return NextResponse.json({ draft, source: 'anthropic' })
  } catch {
    return NextResponse.json({ error: '文面を作成できませんでした。' }, { status: 500 })
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

function fallbackDraft(input: DraftInput): DraftResult {
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

  return {
    subject: `A practical idea for ${recipient}`,
    body: `Hi,\n\nI am ${input.senderName} from ${input.senderCompany}.\n\n${safeReason || `I came across ${recipient} and saw a possible fit with your work.`}\n\nWe provide ${input.offering}.${value ? ` ${value}` : ''}${offerDetail ? ` We can also support ${offerDetail}.` : ''}\n\nWould you be open to a brief 15-minute conversation to see whether this could be useful for your team? If someone else owns this area, I would appreciate a pointer to the right person.`,
  }
}

function getUsableReason(reason?: string) {
  const clean = reason?.replace(/\s+/g, ' ').trim() || ''
  if (!clean || /^matched (a )?real web result/i.test(clean) || clean.length > 420) return ''
  return clean.replace(/[.!?。！？]+$/, '')
}

function hasJapanese(value?: string) {
  return /[ぁ-んァ-ヶ一-龠]/u.test(value || '')
}
