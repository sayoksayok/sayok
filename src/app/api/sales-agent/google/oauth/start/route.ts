import { NextResponse, type NextRequest } from 'next/server'
import { requireSalesAgentUser } from '@/lib/sales-agent-auth'
import { createSalesGoogleOAuthState } from '@/lib/sales-agent-oauth-state'

const scopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
]

export async function POST(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const clientId = process.env.GOOGLE_CLIENT_ID || ''
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID が設定されていません。' }, { status: 500 })
  const redirectUri = oauthRedirectUri(request)
  const state = createSalesGoogleOAuthState({
    userId: context.user.id,
    workspaceId: context.workspaceId,
    returnTo: request.headers.get('referer')?.includes('/new-deal') ? '/new-deal' : '/',
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent select_account',
    state,
  }).toString()

  return NextResponse.json({ authorizationUrl: url.toString(), redirectUri })
}

function oauthRedirectUri(request: NextRequest) {
  return process.env.SALES_AGENT_GOOGLE_REDIRECT_URI
    || `${request.nextUrl.origin}/api/sales-agent/google/oauth/callback`
}
