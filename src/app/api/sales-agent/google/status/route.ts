import { NextResponse, type NextRequest } from 'next/server'
import { requireSalesAgentUser, type SalesAgentServerContext } from '@/lib/sales-agent-auth'
import {
  SALES_PRODUCTS,
  canAccountSend,
  clampLimit,
  listProductSenders,
  listUserSalesAccounts,
  normalizeSalesProduct,
} from '@/lib/sales-agent-senders'

export async function GET(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context
  return statusResponse(context)
}

export async function PUT(request: NextRequest) {
  const context = await requireSalesAgentUser(request)
  if (context instanceof NextResponse) return context
  const body = (await request.json().catch(() => null)) as {
    productSenders?: Record<string, string>
    accountLimits?: Record<string, number>
  } | null
  if (!body) return NextResponse.json({ error: '設定内容がありません。' }, { status: 400 })

  try {
    const accounts = await listUserSalesAccounts(context.admin, context.workspaceId, context.user.id)
    const ownedEmails = new Set(accounts.map((account) => account.google_email))
    const mappingRows = Object.entries(body.productSenders || {}).map(([rawProduct, rawSender]) => {
      const product = normalizeSalesProduct(rawProduct)
      const senderEmail = String(rawSender || '').trim().toLowerCase()
      if (!product) throw new Error(`未対応の商材です: ${rawProduct}`)
      if (!ownedEmails.has(senderEmail)) throw new Error(`${senderEmail} はあなたの接続済みGoogleアカウントではありません。`)
      return {
        workspace_id: context.workspaceId,
        user_id: context.user.id,
        product,
        sender_email: senderEmail,
        updated_at: new Date().toISOString(),
      }
    })
    if (mappingRows.length) {
      const { error } = await context.admin
        .from('sales_agent_product_senders')
        .upsert(mappingRows, { onConflict: 'workspace_id,user_id,product' })
      if (error) throw new Error(error.message)
    }

    for (const [rawEmail, rawLimit] of Object.entries(body.accountLimits || {})) {
      const email = rawEmail.trim().toLowerCase()
      if (!ownedEmails.has(email)) throw new Error(`${email} の送信上限を変更する権限がありません。`)
      const account = accounts.find((item) => item.google_email === email)
      if (account?.connection_source !== 'sales_agent_google_accounts') {
        throw new Error(`${email} は営業用アカウントとして再接続してから上限を変更してください。`)
      }
      const { error } = await context.admin.from('sales_agent_google_accounts').update({
        daily_send_limit: clampLimit(rawLimit),
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', context.workspaceId).eq('user_id', context.user.id).eq('google_email', email)
      if (error) throw new Error(error.message)
    }

    return statusResponse(context)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '送信元設定を保存できませんでした。' }, { status: 400 })
  }
}

async function statusResponse(context: SalesAgentServerContext) {
  try {
    const [accounts, productSenders] = await Promise.all([
      listUserSalesAccounts(context.admin, context.workspaceId, context.user.id),
      listProductSenders(context.admin, context.workspaceId, context.user.id),
    ])
    const publicAccounts = accounts.map((account) => ({
      email: account.google_email,
      status: account.status,
      canSend: canAccountSend(account),
      needsReauth: !canAccountSend(account),
      dailySendLimit: account.daily_send_limit,
      connectionSource: account.connection_source,
    }))
    const first = publicAccounts.find((account) => account.canSend) || publicAccounts[0]
    return NextResponse.json({
      connected: publicAccounts.length > 0,
      canSend: publicAccounts.some((account) => account.canSend),
      googleEmail: first?.email || null,
      needsReauth: publicAccounts.length > 0 && !publicAccounts.some((account) => account.canSend),
      accounts: publicAccounts,
      products: SALES_PRODUCTS,
      productSenders,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gmail接続状態を取得できませんでした。' }, { status: 500 })
  }
}
