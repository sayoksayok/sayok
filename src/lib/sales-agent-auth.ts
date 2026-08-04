import { NextResponse, type NextRequest } from 'next/server'
import { requireWorkOsUser, type WorkOsServerContext } from '@/lib/work-os-server'

export const salesAgentAllowedEmail = (process.env.SALES_AGENT_ALLOWED_EMAIL || 'yudai@looq.icu').trim().toLowerCase()

export async function requireSalesAgentUser(
  request: NextRequest,
): Promise<WorkOsServerContext | NextResponse> {
  const context = await requireWorkOsUser(request)
  if (context instanceof NextResponse) return context

  const email = context.user.email?.trim().toLowerCase() || ''
  if (!email || email !== salesAgentAllowedEmail) {
    return NextResponse.json(
      { error: `${salesAgentAllowedEmail} のログインのみ利用できます。` },
      { status: 403 },
    )
  }

  return context
}
