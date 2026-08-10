export type GmailPayloadPart = {
  mimeType?: string
  headers?: Array<{ name: string; value: string }>
  body?: { data?: string }
  parts?: GmailPayloadPart[]
}

export type GmailBounceMessage = {
  id: string
  threadId?: string
  internalDate?: string
  snippet?: string
  payload?: GmailPayloadPart
}

export type ParsedBounce = {
  gmailMessageId: string
  gmailThreadId: string | null
  recipientEmail: string
  bounceType: 'hard' | 'soft' | 'unknown'
  smtpCode: string | null
  reason: string
  bouncedAt: string | null
}

const bounceQuery = [
  'in:anywhere',
  '{',
  'from:mailer-daemon',
  'from:postmaster',
  'subject:"Undelivered"',
  'subject:"Delivery Status Notification"',
  'subject:"Address not found"',
  'subject:"配信不能"',
  '}',
].join(' ')

export async function listGmailBounceMessages(
  accessToken: string,
  options: { after?: Date; maxMessages?: number } = {},
) {
  const maxMessages = Math.max(1, Math.min(options.maxMessages || 2_000, 5_000))
  const query = options.after
    ? `${bounceQuery} after:${formatGmailDate(options.after)}`
    : bounceQuery
  const messageRefs: Array<{ id: string; threadId?: string }> = []
  let pageToken = ''

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(500, maxMessages - messageRefs.length)),
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await googleFetch<{
      messages?: Array<{ id: string; threadId?: string }>
      nextPageToken?: string
    }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, accessToken)
    messageRefs.push(...(page.messages || []))
    pageToken = page.nextPageToken || ''
  } while (pageToken && messageRefs.length < maxMessages)

  const messages: GmailBounceMessage[] = []
  for (let index = 0; index < messageRefs.length; index += 20) {
    const batch = messageRefs.slice(index, index + 20)
    messages.push(...await Promise.all(batch.map(({ id }) => googleFetch<GmailBounceMessage>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      accessToken,
    ))))
  }
  return messages
}

export function parseBounceMessage(message: GmailBounceMessage, knownRecipients: Set<string>) {
  const headers = message.payload?.headers || []
  const headerText = headers.map(({ name, value }) => `${name}: ${value}`).join('\n')
  const content = [headerText, collectPartText(message.payload), message.snippet || ''].join('\n')
  const recipients = extractRecipientCandidates(content)
    .filter((email) => knownRecipients.has(email))
  const uniqueRecipients = [...new Set(recipients)]
  const classification = classifyBounce(content)
  const reason = extractBounceReason(content, classification.smtpCode)
  const bouncedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null

  return uniqueRecipients.map((recipientEmail): ParsedBounce => ({
    gmailMessageId: message.id,
    gmailThreadId: message.threadId || null,
    recipientEmail,
    bounceType: classification.bounceType,
    smtpCode: classification.smtpCode,
    reason,
    bouncedAt,
  }))
}

export function classifyBounce(content: string): Pick<ParsedBounce, 'bounceType' | 'smtpCode'> {
  const enhancedCodes = [...content.matchAll(/\b([45]\.\d{1,3}\.\d{1,3})\b/g)].map((match) => match[1])
  const smtpCodes = [...content.matchAll(/(?:^|[\s:;,(])([45]\d{2})(?=$|[\s.;,)])/gm)].map((match) => match[1])
  const hardCode = enhancedCodes.find((code) => code.startsWith('5.'))
    || smtpCodes.find((code) => code.startsWith('5'))
  if (hardCode) return { bounceType: 'hard', smtpCode: hardCode }
  const softCode = enhancedCodes.find((code) => code.startsWith('4.'))
    || smtpCodes.find((code) => code.startsWith('4'))
  if (softCode) return { bounceType: 'soft', smtpCode: softCode }
  return { bounceType: 'unknown', smtpCode: null }
}

function collectPartText(part?: GmailPayloadPart): string {
  if (!part) return ''
  const own = part.body?.data ? decodeBase64Url(part.body.data) : ''
  return [own, ...(part.parts || []).map(collectPartText)].filter(Boolean).join('\n')
}

function decodeBase64Url(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(normalized, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function extractRecipientCandidates(content: string) {
  const preferred = [
    ...content.matchAll(/(?:Final-Recipient|Original-Recipient)\s*:\s*(?:rfc822;\s*)?([^\s<>;,]+@[^\s<>;,]+)/gi),
    ...content.matchAll(/X-Failed-Recipients\s*:\s*([^\r\n]+)/gi),
  ].flatMap((match) => extractEmails(match[1] || ''))
  return [...new Set([...preferred, ...extractEmails(content)])]
}

function extractEmails(value: string) {
  return [...value.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi)]
    .map((match) => match[0].toLowerCase().replace(/[.,;:]+$/, ''))
}

function extractBounceReason(content: string, smtpCode: string | null) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const diagnostic = lines.find((line) => /diagnostic-code|final-recipient|address not found|user unknown|mailbox unavailable|delivery|配信不能/i.test(line))
    || (smtpCode ? lines.find((line) => line.includes(smtpCode)) : null)
  return (diagnostic || 'Delivery failure notification; no diagnostic reason was found.').slice(0, 500)
}

function formatGmailDate(value: Date) {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

async function googleFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gmail API ${response.status}: ${body.slice(0, 400)}`)
  }
  return response.json() as Promise<T>
}
