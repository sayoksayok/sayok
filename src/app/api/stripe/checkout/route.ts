import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const priceMonthly = process.env.STRIPE_PRICE_MONTHLY;
const priceYearly = process.env.STRIPE_PRICE_YEARLY;

if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set');
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as any })
  : (null as unknown as Stripe);

export async function POST(request: NextRequest) {
  try {
    if (!stripeSecretKey || !stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const { plan, userId } = await request.json();

    if (!userId || (plan !== 'monthly' && plan !== 'yearly')) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
    }

    const priceId = plan === 'monthly' ? priceMonthly : priceYearly;

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured' }, { status: 500 });
    }

    const origin =
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
      },
      subscription_data: {
        metadata: {
          userId,
        },
      },
      success_url: `${origin}/?pro=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pro`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

