import { NextResponse, type NextRequest } from 'next/server'
import { saveSalesGoogleAccount, gmailSendScope } from '@/lib/sales-agent-google-accounts'
import { verifySalesGoogleOAuthState } from '@/lib/sales-agent-oauth-state'
import { getSupabaseAdmin } from '@/lib/work-os-server'

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error_description?: string
}

type TokenInfo = {
  email?: string
  email_verified?: string
  scope?: string
  expires_in?: string
  error_description?: string
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error')
  const stateValue = request.nextUrl.searchParams.get('state') || ''
  let returnTo = '/'

  try {
    const state = verifySalesGoogleOAuthState(stateValue)
    returnTo = state.returnTo === '/new-deal' ? '/new-deal' : '/'
    if (error) throw new Error(`Google接続がキャンセルされました: ${error}`)
    const code = request.nextUrl.searchParams.get('code') || ''
    if (!code) throw new Error('Google認証コードがありません。')

    const admin = getSupabaseAdmin()
    if (!admin) throw new Error('Supabase server environment is not configured')
    const { data: membership } = await admin
      .from('work_os_members')
      .select('workspace_id,user_id')
      .eq('workspace_id', state.workspaceId)
      .eq('user_id', state.userId)
      .maybeSingle()
    if (!membership) throw new Error('このワークスペースへGoogleアカウントを接続する権限がありません。')

    const redirectUri = process.env.SALES_AGENT_GOOGLE_REDIRECT_URI
      || `${request.nextUrl.origin}/api/sales-agent/google/oauth/callback`
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })
    const token = (await tokenResponse.json().catch(() => ({}))) as TokenResponse
    if (!tokenResponse.ok || !token.access_token) {
      throw new Error(token.error_description || 'Google token exchange failed')
    }
    const infoResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token.access_token)}`,
      { cache: 'no-store' },
    )
    const info = (await infoResponse.json().catch(() => ({}))) as TokenInfo
    const googleEmail = info.email?.trim().toLowerCase() || ''
    const grantedScopes = (info.scope || token.scope || '').split(/\s+/).filter(Boolean)
    if (!infoResponse.ok || !googleEmail || info.email_verified === 'false') {
      throw new Error(info.error_description || '接続したGoogleメールを確認できませんでした。')
    }
    if (!grantedScopes.includes(gmailSendScope)) {
      throw new Error('Gmail送信権限が付与されていません。')
    }

    await saveSalesGoogleAccount(admin, {
      workspaceId: state.workspaceId,
      userId: state.userId,
      googleEmail,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
      scopes: grantedScopes,
    })

    return NextResponse.redirect(new URL(`${returnTo}?google_connected=1`, request.nextUrl.origin))
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Googleアカウントを接続できませんでした。'
    console.error('[sales-agent] Google account connection failed', message)
    const url = new URL(returnTo, request.nextUrl.origin)
    url.searchParams.set('google_connection_error', '1')
    return NextResponse.redirect(url)
  }
}
