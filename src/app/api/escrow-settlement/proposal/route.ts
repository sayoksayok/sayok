import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type ProposalBody = {
  referralId?: string
  payee?: string
  proposedAmount?: string
  condition?: string
  context?: string
}

type UpdateBody = {
  auditId?: string
  txHash?: string
  status?: 'deposited' | 'released' | 'refunded'
}

let adminClient: SupabaseClient | null = null

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminClient
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_ESCROW_DEMO !== 'true') {
    return NextResponse.json({ error: 'Escrow demo is disabled.' }, { status: 404 })
  }

  const body = await request.json() as ProposalBody
  const referralId = body.referralId?.trim()
  const payee = body.payee?.trim()
  const proposedAmount = body.proposedAmount?.trim()
  const condition = body.condition?.trim()
  const context = body.context?.trim()

  if (!referralId || !payee || !proposedAmount || !condition) {
    return NextResponse.json({ error: 'Missing referralId, payee, proposedAmount, or condition.' }, { status: 400 })
  }

  const agentReasoning = await generateAgentReasoning({
    referralId,
    payee,
    proposedAmount,
    condition,
    context: context || '',
  })

  const client = getAdminClient()
  if (!client) {
    return NextResponse.json({
      error: 'Supabase service role is required to persist escrow audit records.',
      agentReasoning,
    }, { status: 503 })
  }

  const { data, error } = await client
    .from('escrow_settlement_audits')
    .insert({
      referral_id: referralId,
      agent_reasoning: agentReasoning,
      proposed_amount: proposedAmount,
      payee,
      status: 'proposed',
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('escrow proposal insert failed:', error)
    return NextResponse.json({ error: 'Could not persist escrow audit proposal.', agentReasoning }, { status: 500 })
  }

  return NextResponse.json({
    auditId: data.id,
    agentReasoning,
    status: 'proposed',
    createdAt: data.created_at,
  })
}

export async function PATCH(request: Request) {
  if (process.env.NEXT_PUBLIC_ESCROW_DEMO !== 'true') {
    return NextResponse.json({ error: 'Escrow demo is disabled.' }, { status: 404 })
  }

  const body = await request.json() as UpdateBody
  if (!body.auditId || !body.status) {
    return NextResponse.json({ error: 'Missing auditId or status.' }, { status: 400 })
  }

  const client = getAdminClient()
  if (!client) {
    return NextResponse.json({ error: 'Supabase service role is required to update escrow audit records.' }, { status: 503 })
  }

  const { error } = await client
    .from('escrow_settlement_audits')
    .update({
      tx_hash: body.txHash || null,
      status: body.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.auditId)

  if (error) {
    console.error('escrow proposal update failed:', error)
    return NextResponse.json({ error: 'Could not update escrow audit record.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

async function generateAgentReasoning(input: Required<ProposalBody>) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const fallback = `Agent proposes settlement because referral ${input.referralId} reached "${input.condition}". Payee ${input.payee} should receive ${input.proposedAmount} testnet token units if the human approves in wallet.`
  if (!apiKey) return fallback

  const prompt = `You are SayOK Agent. Write one concise settlement reasoning sentence for a testnet escrow demo.
Do not mention guarantees. Do not mention mainnet. Do not exceed 45 words.

Referral ID: ${input.referralId}
Payee: ${input.payee}
Proposed amount: ${input.proposedAmount}
Condition considered met: ${input.condition}
Context: ${input.context}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 160,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) return fallback
    const data = await response.json()
    return data.content?.[0]?.text?.trim() || fallback
  } catch {
    return fallback
  }
}
