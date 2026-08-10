import { NextResponse, type NextRequest } from 'next/server'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'

type ActivityPayload = Record<string, unknown>

type SalesEmailEvent = {
  id: string
  created_at: string
  payload: ActivityPayload | null
}

export async function GET(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const { data, error } = await context.admin
    .from('work_os_activity_events')
    .select('id,created_at,payload')
    .eq('workspace_id', context.workspaceId)
    .eq('event_type', 'sales_email_sent')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = ((data || []) as SalesEmailEvent[])
    .map((event) => {
      const payload = event.payload || {}
      const toEmail = cleanString(payload.to_email).toLowerCase()
      if (!toEmail) return null

      return {
        id: event.id,
        organization: cleanOrganization(cleanString(payload.organization)),
        toEmail,
        subject: cleanString(payload.subject),
        sourceUrl: cleanString(payload.source_url),
        sentAt: cleanString(payload.sent_at) || event.created_at,
        fromEmail: cleanString(payload.sender_email) || cleanString(payload.google_email),
        product: cleanString(payload.product),
        gmailMessageId: cleanString(payload.gmail_message_id),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return NextResponse.json({ items, total: items.length })
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanOrganization(value: string) {
  return value.replace(/\s+https?\s*$/i, '').trim() || '送信先企業'
}
