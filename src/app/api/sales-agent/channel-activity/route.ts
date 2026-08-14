import { NextRequest, NextResponse } from 'next/server'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'

type Channel = 'email' | 'linkedin'
type ActivityStatus = 'prepared' | 'sent' | 'replied' | 'meeting' | 'snoozed' | 'dismissed'

type ActivityPayload = {
  leadId?: string
  organization?: string
  channel?: Channel
  status?: ActivityStatus
  profileUrl?: string
  message?: string
  followUpAt?: string
  product?: string
}

const validChannels = new Set<Channel>(['email', 'linkedin'])
const validStatuses = new Set<ActivityStatus>(['prepared', 'sent', 'replied', 'meeting', 'snoozed', 'dismissed'])

export async function GET(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const { data, error } = await context.admin
    .from('work_os_activity_events')
    .select('id,created_at,payload')
    .eq('workspace_id', context.workspaceId)
    .eq('event_type', 'sales_channel_activity')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data || []).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    ...(row.payload as Record<string, unknown>),
  }))
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const input = (await request.json()) as ActivityPayload
  const leadId = clean(input.leadId, 180)
  const organization = clean(input.organization, 240)
  const channel = input.channel
  const status = input.status
  const product = clean(input.product, 40)

  if (!leadId || !organization || !channel || !validChannels.has(channel) || !status || !validStatuses.has(status)) {
    return NextResponse.json({ error: '営業アクションの内容を確認してください。' }, { status: 400 })
  }

  const profileUrl = cleanPublicUrl(input.profileUrl)
  const followUpAt = cleanDate(input.followUpAt)
  const message = clean(input.message, 6000)
  const summary = `${organization}: ${channel === 'linkedin' ? 'LinkedIn' : 'Email'} ${status}`
  const payload = {
    lead_id: leadId,
    organization,
    channel,
    status,
    product,
    profile_url: profileUrl,
    message,
    follow_up_at: followUpAt,
    recorded_by: context.user.id,
  }

  const { data, error } = await context.admin
    .from('work_os_activity_events')
    .insert({
      workspace_id: context.workspaceId,
      actor_type: 'user',
      event_type: 'sales_channel_activity',
      summary,
      payload,
    })
    .select('id,created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    item: {
      id: String(data.id),
      createdAt: String(data.created_at),
      ...payload,
    },
  })
}

function clean(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function cleanDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function cleanPublicUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString().slice(0, 1200) : ''
  } catch {
    return ''
  }
}
