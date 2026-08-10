import type { SupabaseClient } from '@supabase/supabase-js'
import { configuredAccountLimits, clampLimit, isMissingRelation } from '@/lib/sales-agent-senders'
import { encryptToken } from '@/lib/work-os-server'

export const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

export async function saveSalesGoogleAccount(
  admin: SupabaseClient,
  input: {
    workspaceId: string
    userId: string
    googleEmail: string
    accessToken: string
    refreshToken?: string | null
    tokenExpiresAt: string
    scopes: string[]
    allowMissingRelation?: boolean
  },
) {
  const googleEmail = input.googleEmail.trim().toLowerCase()
  const { data: existing, error: lookupError } = await admin
    .from('sales_agent_google_accounts')
    .select('encrypted_refresh_token,daily_send_limit')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.userId)
    .eq('google_email', googleEmail)
    .maybeSingle()
  if (lookupError) {
    if (input.allowMissingRelation && isMissingRelation(lookupError)) return
    throw new Error(lookupError.message)
  }

  const configuredLimit = configuredAccountLimits()[googleEmail]
  const { error } = await admin.from('sales_agent_google_accounts').upsert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    google_email: googleEmail,
    encrypted_access_token: encryptToken(input.accessToken),
    encrypted_refresh_token: input.refreshToken
      ? encryptToken(input.refreshToken)
      : existing?.encrypted_refresh_token || null,
    token_expires_at: input.tokenExpiresAt,
    scopes: input.scopes,
    status: 'connected',
    daily_send_limit: configuredLimit || clampLimit(existing?.daily_send_limit),
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,user_id,google_email' })
  if (error) throw new Error(error.message)
}
