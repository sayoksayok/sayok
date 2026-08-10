import type { SupabaseClient } from '@supabase/supabase-js'

export const SALES_PRODUCTS = ['DOGEDAY', 'ALTLIER', 'LOOQ'] as const
export type SalesProduct = (typeof SALES_PRODUCTS)[number]

export type SalesGoogleAccount = {
  id?: string
  workspace_id: string
  user_id: string
  google_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string | null
  token_expires_at: string | null
  scopes: string[]
  status: 'connected' | 'needs_reauth' | 'revoked' | 'error'
  daily_send_limit: number
  last_error: string | null
  connection_source: 'sales_agent_google_accounts' | 'work_os_google_connections'
}

export type ProductSender = {
  product: SalesProduct
  senderEmail: string
  source: 'database' | 'environment'
}

const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'
const legacyDailyLimit = clampLimit(process.env.SALES_AGENT_DAILY_SEND_LIMIT)

export function normalizeSalesProduct(value: unknown): SalesProduct | null {
  const normalized = String(value || '').trim().toUpperCase()
  return SALES_PRODUCTS.includes(normalized as SalesProduct) ? normalized as SalesProduct : null
}

export function canAccountSend(account: Pick<SalesGoogleAccount, 'status' | 'scopes'>) {
  return account.status === 'connected' && account.scopes.includes(gmailSendScope)
}

export function configuredSenderMap() {
  return parseStringMap(process.env.SALES_AGENT_PRODUCT_SENDERS)
}

export function configuredAccountLimits() {
  const values = parseRecord(process.env.SALES_AGENT_ACCOUNT_DAILY_LIMITS)
  return Object.fromEntries(Object.entries(values).map(([email, value]) => [email.trim().toLowerCase(), clampLimit(value)]))
}

export async function listUserSalesAccounts(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<SalesGoogleAccount[]> {
  const { data, error } = await admin
    .from('sales_agent_google_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('connected_at', { ascending: true })

  if (error && !isMissingRelation(error)) throw new Error(error.message)
  const accounts = (data || []).map((row) => ({
    ...row,
    google_email: String(row.google_email || '').trim().toLowerCase(),
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    daily_send_limit: clampLimit(row.daily_send_limit),
    connection_source: 'sales_agent_google_accounts' as const,
  })) as SalesGoogleAccount[]

  const { data: legacy, error: legacyError } = await admin
    .from('work_os_google_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (legacyError) throw new Error(legacyError.message)

  const legacyEmail = String(legacy?.google_email || '').trim().toLowerCase()
  if (legacy && legacyEmail && !accounts.some((account) => account.google_email === legacyEmail)) {
    accounts.push({
      ...legacy,
      google_email: legacyEmail,
      scopes: Array.isArray(legacy.scopes) ? legacy.scopes : [],
      daily_send_limit: configuredAccountLimits()[legacyEmail] || legacyDailyLimit,
      connection_source: 'work_os_google_connections',
    } as SalesGoogleAccount)
  }

  return accounts
}

export async function listProductSenders(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<ProductSender[]> {
  const environment = configuredSenderMap()
  const { data, error } = await admin
    .from('sales_agent_product_senders')
    .select('product,sender_email')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  if (error && !isMissingRelation(error)) throw new Error(error.message)
  const database = new Map<string, string>()
  for (const row of data || []) {
    const product = normalizeSalesProduct(row.product)
    const senderEmail = String(row.sender_email || '').trim().toLowerCase()
    if (product && senderEmail) database.set(product, senderEmail)
  }

  const mappings: ProductSender[] = []
  for (const product of SALES_PRODUCTS) {
    const databaseSender = database.get(product)
    if (databaseSender) {
      mappings.push({ product, senderEmail: databaseSender, source: 'database' })
      continue
    }
    const environmentSender = String(environment[product] || '').trim().toLowerCase()
    if (environmentSender) {
      mappings.push({ product, senderEmail: environmentSender, source: 'environment' })
    }
  }
  return mappings
}

export async function resolveProductSender(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
  product: SalesProduct,
) {
  const [accounts, mappings] = await Promise.all([
    listUserSalesAccounts(admin, workspaceId, userId),
    listProductSenders(admin, workspaceId, userId),
  ])
  const mapping = mappings.find((item) => item.product === product)
  if (!mapping) {
    throw new Error(`${product} の送信アカウントが設定されていません。既定アカウントでは送信しません。`)
  }
  const account = accounts.find((item) => item.google_email === mapping.senderEmail)
  if (!account) {
    throw new Error(`${product} に設定された ${mapping.senderEmail} は、このユーザーの接続済みGoogleアカウントではありません。`)
  }
  if (!canAccountSend(account)) {
    throw new Error(`${mapping.senderEmail} のGmail送信権限を再接続してください。`)
  }
  return { account, mapping }
}

export function clampLimit(value: unknown) {
  const parsed = Number(value || 20)
  return Math.max(1, Math.min(500, Number.isFinite(parsed) ? Math.round(parsed) : 20))
}

export function isMissingRelation(error: { code?: string; message?: string }) {
  return error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')
}

function parseStringMap(value: string | undefined): Record<string, string> {
  const parsed = parseRecord(value)
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key.trim().toUpperCase(), String(item || '').trim().toLowerCase()]))
}

function parseRecord(value: string | undefined): Record<string, unknown> {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}
