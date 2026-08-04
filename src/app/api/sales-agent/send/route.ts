import { NextResponse, type NextRequest } from 'next/server'
import { requireSalesAgentUser, salesAgentAllowedEmail } from '@/lib/sales-agent-auth'
import {
  getValidSalesAgentAccessToken,
  sendSalesEmail,
  type SalesAgentGoogleConnection,
} from '@/lib/sales-agent-google'

export const maxDuration = 45

type SendInput = {
  to?: string
  subject?: string
  body?: string
  organization?: string
  sourceUrl?: string
  approvedBy?: string
  confirmed?: boolean
  confirmationText?: string
}

const dailySendLimit = Math.max(1, Math.min(100, Number(process.env.SALES_AGENT_DAILY_SEND_LIMIT || 20)))

export async function POST(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const input = (await request.json().catch(() => null)) as SendInput | null
  const validationError = validateSendInput(input)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const to = input!.to!.trim().toLowerCase()
  const approvedBy = input!.approvedBy!.trim().toLowerCase()
  if (approvedBy !== context.user.email?.toLowerCase() || approvedBy !== salesAgentAllowedEmail) {
    return NextResponse.json({ error: 'ログイン本人の承認を確認できません。' }, { status: 403 })
  }

  const { count, error: countError } = await context.admin
    .from('sales_agent_email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', context.user.id)
    .in('status', ['approved', 'sent'])
    .gte('created_at', startOfTokyoDay())
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count || 0) >= dailySendLimit) {
    return NextResponse.json({ error: `本日の送信上限 ${dailySendLimit} 通に達しました。` }, { status: 429 })
  }

  const [{ data: suppressed }, { data: duplicate }, { data: connection, error: connectionError }] = await Promise.all([
    context.admin.from('sales_agent_suppressions').select('id,reason').eq('user_id', context.user.id).eq('email', to).maybeSingle(),
    context.admin.from('sales_agent_email_sends').select('id,sent_at').eq('user_id', context.user.id).eq('to_email', to).eq('status', 'sent').limit(1).maybeSingle(),
    context.admin.from('sales_agent_google_connections').select('*').eq('user_id', context.user.id).maybeSingle(),
  ])
  if (suppressed) return NextResponse.json({ error: 'この宛先は配信停止リストに登録されています。' }, { status: 409 })
  if (duplicate) return NextResponse.json({ error: 'この宛先には送信済みです。重複送信を停止しました。' }, { status: 409 })
  if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 500 })
  if (!connection) return NextResponse.json({ error: '送信前にGmailを接続してください。' }, { status: 409 })

  const { data: audit, error: auditError } = await context.admin.from('sales_agent_email_sends').insert({
    user_id: context.user.id,
    google_email: salesAgentAllowedEmail,
    organization: input!.organization!.trim(),
    to_email: to,
    subject: input!.subject!.trim(),
    source_url: input!.sourceUrl!.trim(),
    status: 'approved',
    approved_at: new Date().toISOString(),
  }).select('id').single()
  if (auditError || !audit) {
    return NextResponse.json({ error: auditError?.message || '送信承認を記録できませんでした。' }, { status: 500 })
  }

  try {
    const accessToken = await getValidSalesAgentAccessToken(
      context.admin,
      connection as SalesAgentGoogleConnection,
    )
    const sent = await sendSalesEmail(accessToken, {
      to,
      subject: input!.subject!.trim(),
      body: input!.body!.trim(),
    })
    const sentAt = new Date().toISOString()
    await context.admin.from('sales_agent_email_sends').update({
      status: 'sent',
      gmail_message_id: sent.id,
      gmail_thread_id: sent.threadId,
      sent_at: sentAt,
      error: null,
    }).eq('id', audit.id)

    return NextResponse.json({
      ok: true,
      messageId: sent.id,
      threadId: sent.threadId,
      sentAt,
      from: salesAgentAllowedEmail,
      to,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail送信に失敗しました。'
    await context.admin.from('sales_agent_email_sends').update({ status: 'failed', error: message }).eq('id', audit.id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function validateSendInput(input: SendInput | null) {
  if (!input) return '送信内容がありません。'
  if (input.confirmed !== true || input.confirmationText !== 'APPROVE_AND_SEND') return '最終承認が必要です。'
  if (!input.approvedBy?.trim()) return '承認者を確認できません。'
  if (!input.organization?.trim() || input.organization.length > 200) return '営業先名を確認してください。'
  if (!input.subject?.trim() || input.subject.length > 180) return '件名を確認してください。'
  if (!input.body?.trim() || input.body.length > 12_000) return '本文を確認してください。'
  if (!input.sourceUrl?.trim() || !isPublicHttpUrl(input.sourceUrl)) return '公開連絡先の出典URLが必要です。'

  const email = input.to?.trim().toLowerCase() || ''
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return '宛先メールを確認してください。'
  const [local, domain] = email.split('@')
  if (['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster'].includes(local)) {
    return '受信しないアドレスには送信できません。'
  }
  if (['example.com', 'example.org', 'example.net', 'sample.com', 'test.com', 'mailinator.com'].includes(domain)) {
    return 'デモ用アドレスには送信できません。'
  }
  return ''
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && url.hostname !== 'localhost'
  } catch {
    return false
  }
}

function startOfTokyoDay() {
  const day = 24 * 60 * 60 * 1000
  const offset = 9 * 60 * 60 * 1000
  return new Date(Math.floor((Date.now() + offset) / day) * day - offset).toISOString()
}
