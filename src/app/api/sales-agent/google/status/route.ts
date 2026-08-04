import { NextResponse, type NextRequest } from 'next/server'
import { requireSalesAgentUser, salesAgentAllowedEmail } from '@/lib/sales-agent-auth'

const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

export async function GET(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const { data, error } = await context.admin
    .from('sales_agent_google_connections')
    .select('google_email,scopes,status,token_expires_at')
    .eq('user_id', context.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const scopes = Array.isArray(data?.scopes) ? data.scopes : []
  const emailMatches = data?.google_email?.toLowerCase() === salesAgentAllowedEmail
  const canSend = Boolean(emailMatches && scopes.includes(gmailSendScope) && data?.status === 'connected')
  return NextResponse.json({
    connected: Boolean(data && emailMatches),
    canSend,
    googleEmail: data?.google_email || null,
    needsReauth: Boolean(data && !canSend),
  })
}
