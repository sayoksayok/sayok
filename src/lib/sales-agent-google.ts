import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from '@/lib/work-os-server'

export type SalesAgentGoogleConnection = {
  id?: string
  workspace_id: string
  user_id: string
  google_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string | null
  token_expires_at: string | null
  scopes: string[]
  status: 'connected' | 'needs_reauth' | 'revoked' | 'error'
  last_error: string | null
  daily_send_limit?: number
  connection_source?: 'sales_agent_google_accounts' | 'work_os_google_connections'
}

const googleClientId = process.env.GOOGLE_CLIENT_ID || ''
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || ''

export async function getValidSalesAgentAccessToken(
  admin: SupabaseClient,
  connection: SalesAgentGoogleConnection,
) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0
  const accessToken = decryptToken(connection.encrypted_access_token)
  if (accessToken && expiresAt > Date.now() + 60_000) return accessToken

  const refreshToken = decryptToken(connection.encrypted_refresh_token)
  if (!refreshToken) throw new Error('Gmailの再接続が必要です。')
  if (!googleClientId || !googleClientSecret) {
    throw new Error('Google OAuthのサーバー設定が不足しています。')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    scope?: string
    error_description?: string
  }
  if (!response.ok || !data.access_token) {
    await updateConnection(admin, connection, {
      status: 'needs_reauth',
      last_error: data.error_description || 'Google token refresh failed',
      updated_at: new Date().toISOString(),
    })
    throw new Error('Gmailの認証期限が切れました。再接続してください。')
  }

  const scopes = data.scope ? data.scope.split(/\s+/).filter(Boolean) : connection.scopes
  if (!scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
    throw new Error('Gmail送信権限がありません。再接続してください。')
  }

  const tokenExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  const update = {
    encrypted_access_token: encryptToken(data.access_token),
    token_expires_at: tokenExpiresAt,
    scopes,
    status: 'connected',
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  await updateConnection(admin, connection, connection.connection_source === 'sales_agent_google_accounts'
    ? update
    : { ...update, gmail_connected: true })

  return data.access_token
}

async function updateConnection(
  admin: SupabaseClient,
  connection: SalesAgentGoogleConnection,
  values: Record<string, unknown>,
) {
  const table = connection.connection_source === 'sales_agent_google_accounts'
    ? 'sales_agent_google_accounts'
    : 'work_os_google_connections'
  let query = admin.from(table).update(values)
    .eq('workspace_id', connection.workspace_id)
    .eq('user_id', connection.user_id)
  if (table === 'sales_agent_google_accounts') {
    query = query.eq('google_email', connection.google_email)
  }
  const { error } = await query
  if (error) throw new Error(error.message)
}

export async function sendSalesEmail(
  accessToken: string,
  input: {
    to: string
    subject: string
    body: string
    attachments?: Array<{ filename: string; mimeType: string; content: Buffer }>
  },
) {
  const to = singleLine(input.to)
  const subject = `=?UTF-8?B?${Buffer.from(singleLine(input.subject), 'utf8').toString('base64')}?=`
  const attachments = input.attachments || []
  const raw = attachments.length
    ? buildMultipartMessage({ to, subject, body: input.body, attachments })
    : [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        input.body,
      ].join('\r\n')

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64Url(raw) }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    id?: string
    threadId?: string
    error?: { message?: string }
  }
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || `Gmail API returned ${response.status}`)
  }
  return { id: data.id, threadId: data.threadId || null }
}

function buildMultipartMessage(input: {
  to: string
  subject: string
  body: string
  attachments: Array<{ filename: string; mimeType: string; content: Buffer }>
}) {
  const boundary = `sayok_${crypto.randomUUID()}`
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
  ]

  for (const attachment of input.attachments) {
    const filename = safeFilename(attachment.filename)
    const mimeType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(attachment.mimeType)
      ? attachment.mimeType
      : 'application/octet-stream'
    lines.push(
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      wrapBase64(attachment.content.toString('base64')),
    )
  }
  lines.push(`--${boundary}--`, '')
  return lines.join('\r\n')
}

function safeFilename(value: string) {
  return singleLine(value).replace(/["\\]/g, '_').slice(0, 180) || 'attachment'
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join('\r\n') || ''
}

function singleLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function base64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
