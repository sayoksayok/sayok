import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'
import { getValidGoogleAccessToken, type GoogleConnection } from '@/lib/google-work-os'
import { listGmailBounceMessages, parseBounceMessage, type ParsedBounce } from '@/lib/sales-agent-bounce-audit'

export const maxDuration = 300

type SentEvent = {
  id: string
  workspace_id: string
  created_at: string
  payload: {
    to_email?: string
    organization?: string
    subject?: string
    gmail_message_id?: string
    gmail_thread_id?: string
    sent_at?: string
    email_source?: string
  } | null
}

const gmailReadScopes = new Set([
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/',
])

export async function POST(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const [events, connectionResult] = await Promise.all([
    listSentEvents(context.admin, context.workspaceId),
    context.admin
      .from('work_os_google_connections')
      .select('*')
      .eq('workspace_id', context.workspaceId)
      .eq('user_id', context.user.id)
      .maybeSingle(),
  ])
  if (connectionResult.error) {
    return NextResponse.json({ error: connectionResult.error.message }, { status: 500 })
  }
  if (!connectionResult.data) {
    return NextResponse.json({ error: 'Gmailが接続されていません。' }, { status: 409 })
  }

  const connection = connectionResult.data as GoogleConnection
  if (!connection.scopes.some((scope) => gmailReadScopes.has(scope))) {
    return NextResponse.json({
      error: 'バウンス調査にはGmail読み取り権限が必要です。Googleを再接続してください。',
      requiredScope: 'https://www.googleapis.com/auth/gmail.readonly',
    }, { status: 409 })
  }

  const sent = events
    .map(normalizeSentEvent)
    .filter((event): event is NormalizedSentEvent => Boolean(event))
  if (!sent.length) return NextResponse.json(emptyReport(connection.google_email))

  const accessToken = await getValidGoogleAccessToken(context.admin, connection)
  const earliestSent = new Date(Math.min(...sent.map((event) => new Date(event.sentAt).getTime())))
  earliestSent.setUTCDate(earliestSent.getUTCDate() - 1)
  const gmailMessages = await listGmailBounceMessages(accessToken, { after: earliestSent })
  const knownRecipients = new Set(sent.map((event) => event.toEmail))
  const parsed = gmailMessages.flatMap((message) => parseBounceMessage(message, knownRecipients))
  const matched = matchBouncesToSends(parsed, sent)
  const hard = matched.filter((item) => item.bounceType === 'hard')
  const soft = matched.filter((item) => item.bounceType === 'soft')
  const unknown = matched.filter((item) => item.bounceType === 'unknown')
  const hardWithKnownSource = hard.filter((item) => item.emailSource)
  const hardMxOnly = hardWithKnownSource.filter((item) => item.emailSource === 'mx_guess')

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    googleEmail: connection.google_email,
    period: {
      from: sent.reduce((min, item) => item.sentAt < min ? item.sentAt : min, sent[0].sentAt),
      to: sent.reduce((max, item) => item.sentAt > max ? item.sentAt : max, sent[0].sentAt),
    },
    totalSent: sent.length,
    hardBounceCount: hard.length,
    hardBounceRate: rate(hard.length, sent.length),
    softBounceCount: soft.length,
    softBounceRate: rate(soft.length, sent.length),
    unknownBounceCount: unknown.length,
    matchedBounceCount: matched.length,
    bounceNotificationsFound: gmailMessages.length,
    unmatchedBounceNotifications: Math.max(0, gmailMessages.length - new Set(parsed.map((item) => item.gmailMessageId)).size),
    emailSourceAttribution: {
      mxOnlyHardBounceCount: hardMxOnly.length,
      hardBouncesWithKnownSource: hardWithKnownSource.length,
      hardBouncesWithUnknownSource: hard.length - hardWithKnownSource.length,
      mxOnlyRateAmongKnownHardBounces: hardWithKnownSource.length
        ? rate(hardMxOnly.length, hardWithKnownSource.length)
        : null,
      note: hardWithKnownSource.length
        ? null
        : '既存のsales_email_sentイベントにはemail_sourceが保存されていないため、Hunter未使用率は算出できません。',
    },
    bounces: matched.map((item) => ({
      recipientEmail: item.toEmail,
      organization: item.organization,
      subject: item.subject,
      bounceType: item.bounceType,
      smtpCode: item.smtpCode,
      reason: item.reason,
      sentAt: item.sentAt,
      bouncedAt: item.bouncedAt,
      gmailMessageId: item.gmailMessageId,
    })),
  })
}

type NormalizedSentEvent = {
  eventId: string
  toEmail: string
  organization: string | null
  subject: string | null
  sentAt: string
  emailSource: string | null
}

type MatchedBounce = ParsedBounce & NormalizedSentEvent

function normalizeSentEvent(event: SentEvent): NormalizedSentEvent | null {
  const toEmail = event.payload?.to_email?.trim().toLowerCase() || ''
  const sentAt = event.payload?.sent_at || event.created_at
  if (!toEmail || !Number.isFinite(new Date(sentAt).getTime())) return null
  return {
    eventId: event.id,
    toEmail,
    organization: event.payload?.organization || null,
    subject: event.payload?.subject || null,
    sentAt,
    emailSource: event.payload?.email_source || null,
  }
}

function matchBouncesToSends(bounces: ParsedBounce[], sent: NormalizedSentEvent[]) {
  const available = new Set(sent.map((event) => event.eventId))
  const matched: MatchedBounce[] = []
  const orderedBounces = [...bounces].sort((a, b) => (a.bouncedAt || '').localeCompare(b.bouncedAt || ''))

  for (const bounce of orderedBounces) {
    const bounceTime = bounce.bouncedAt ? new Date(bounce.bouncedAt).getTime() : Number.POSITIVE_INFINITY
    const candidate = sent
      .filter((event) => (
        available.has(event.eventId)
        && event.toEmail === bounce.recipientEmail
        && new Date(event.sentAt).getTime() <= bounceTime
      ))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]
    if (!candidate) continue
    available.delete(candidate.eventId)
    matched.push({ ...bounce, ...candidate })
  }
  return matched
}

async function listSentEvents(admin: SupabaseClient, workspaceId: string) {
  const events: SentEvent[] = []
  const pageSize = 1_000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('work_os_activity_events')
      .select('id,workspace_id,created_at,payload')
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'sales_email_sent')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    events.push(...((data || []) as SentEvent[]))
    if (!data || data.length < pageSize) break
  }
  return events
}

function rate(count: number, total: number) {
  return total ? Number(((count / total) * 100).toFixed(2)) : 0
}

function emptyReport(googleEmail: string | null) {
  return {
    generatedAt: new Date().toISOString(),
    googleEmail,
    totalSent: 0,
    hardBounceCount: 0,
    hardBounceRate: 0,
    softBounceCount: 0,
    softBounceRate: 0,
    unknownBounceCount: 0,
    matchedBounceCount: 0,
    bounceNotificationsFound: 0,
    unmatchedBounceNotifications: 0,
    emailSourceAttribution: {
      mxOnlyHardBounceCount: 0,
      hardBouncesWithKnownSource: 0,
      hardBouncesWithUnknownSource: 0,
      mxOnlyRateAmongKnownHardBounces: null,
      note: '送信イベントがありません。',
    },
    bounces: [],
  }
}
