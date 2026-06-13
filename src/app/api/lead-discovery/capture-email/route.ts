import { NextRequest, NextResponse } from 'next/server'
import { captureEmailUser } from '@/lib/lead-intent-store'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const result = await captureEmailUser({
    capturedEmail: typeof body.email === 'string' ? body.email : '',
    marketingConsent: Boolean(body.marketingConsent),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
