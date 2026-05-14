import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as any })
  : (null as unknown as Stripe);

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export async function POST(req: NextRequest) {
  try {
    if (!stripe || !stripeSecretKey || !supabaseAdmin) {
      return NextResponse.json({ error: 'Stripe verification not configured' }, { status: 500 });
    }

    const { sessionId, userId } = (await req.json()) as {
      sessionId?: string;
      userId?: string;
    };

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    const checkoutUserId = session.metadata?.userId;
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;

    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    const isMatchingUser = checkoutUserId === userId;

    if (!isMatchingUser || !isPaid || !subscriptionId) {
      return NextResponse.json({ verified: false }, { status: 200 });
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: subscriptionId,
        stripe_subscription_status: 'active',
        is_pro: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Failed to set Pro after checkout verification:', error);
      return NextResponse.json({ error: 'Failed to activate Pro' }, { status: 500 });
    }

    return NextResponse.json({ verified: true }, { status: 200 });
  } catch (error) {
    console.error('Stripe verify-session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

