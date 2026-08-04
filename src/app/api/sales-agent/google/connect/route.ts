import { NextResponse, type NextRequest } from 'next/server'
import { requireSalesAgentUser, salesAgentAllowedEmail } from '@/lib/sales-agent-auth'
import { encryptToken } from '@/lib/work-os-server'

const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

type TokenInfo = {
  email?: string
  email_verified?: string
  scope?: string
  expires_in?: string
  error_description?: string
}

export async function POST(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context

  const body = (await request.json().catch(() => null)) as {
    accessToken?: string
    refreshToken?: string
    expiresAt?: string
  } | null
  if (!body?.accessToken) {
    return NextResponse.json({ error: 'Google access token is required.' }, { status: 400 })
  }

  try {
    const tokenResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(body.accessToken)}`,
      { cache: 'no-store' },
    )
    const tokenInfo = (await tokenResponse.json().catch(() => ({}))) as TokenInfo
    const googleEmail = tokenInfo.email?.trim().toLowerCase() || ''
    const scopes = tokenInfo.scope?.split(/\s+/).filter(Boolean) || []

    if (!tokenResponse.ok || !googleEmail) {
      return NextResponse.json(
        { error: tokenInfo.error_description || 'Googleアカウントを確認できませんでした。' },
        { status: 401 },
      )
    }
    if (googleEmail !== salesAgentAllowedEmail || googleEmail !== context.user.email?.toLowerCase()) {
      return NextResponse.json(
        { error: `${salesAgentAllowedEmail} のGmailだけ接続できます。` },
        { status: 403 },
      )
    }
    if (!scopes.includes(gmailSendScope)) {
      return NextResponse.json(
        { error: 'Gmail送信権限がありません。Googleを再接続してください。' },
        { status: 403 },
      )
    }

    const { data: existing } = await context.admin
      .from('sales_agent_google_connections')
      .select('encrypted_refresh_token')
      .eq('user_id', context.user.id)
      .maybeSingle()
    const expiresIn = Number(tokenInfo.expires_in || 0)
    const tokenExpiresAt = expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : body.expiresAt || new Date(Date.now() + 55 * 60 * 1000).toISOString()

    const { error } = await context.admin.from('sales_agent_google_connections').upsert({
      user_id: context.user.id,
      google_email: googleEmail,
      encrypted_access_token: encryptToken(body.accessToken),
      encrypted_refresh_token: body.refreshToken
        ? encryptToken(body.refreshToken)
        : existing?.encrypted_refresh_token || null,
      token_expires_at: tokenExpiresAt,
      scopes,
      status: 'connected',
      last_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)

    return NextResponse.json({
      connected: true,
      canSend: true,
      googleEmail,
      needsReauth: false,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gmail接続を保存できませんでした。' },
      { status: 500 },
    )
  }
}
