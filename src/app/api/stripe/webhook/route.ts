import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as any })
  : (null as unknown as Stripe);

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

async function updateUserProStatus(params: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus: string;
  isPro: boolean;
}) {
  if (!supabaseAdmin) return;
  const { userId, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, isPro } = params;
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_subscription_id: stripeSubscriptionId ?? null,
      stripe_subscription_status: stripeSubscriptionStatus,
      is_pro: isPro,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating user pro status:', error);
  }
}

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    console.warn('Stripe or webhook secret not configured');
    return new NextResponse('Not configured', { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new NextResponse('Missing signature', { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return new NextResponse('Webhook Error', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = (session.metadata?.userId as string | undefined) || undefined;
        const subscriptionId = (session.subscription as string) || undefined;
        const customerId = (session.customer as string) || undefined;

        if (userId && subscriptionId) {
          await updateUserProStatus({
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionStatus: 'active',
            isPro: true,
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = (subscription.metadata?.userId as string | undefined) || undefined;
        const status = subscription.status;
        const isPro = status === 'active' || status === 'trialing';
        if (userId) {
          await updateUserProStatus({
            userId,
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: status,
            isPro,
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = (subscription.metadata?.userId as string | undefined) || undefined;
        if (userId) {
          await updateUserProStatus({
            userId,
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: 'canceled',
            isPro: false,
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string | undefined;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = (subscription.metadata?.userId as string | undefined) || undefined;
          if (userId) {
            await updateUserProStatus({
              userId,
              stripeCustomerId: subscription.customer as string,
              stripeSubscriptionId: subscription.id,
              stripeSubscriptionStatus: 'past_due',
              isPro: false,
            });
          }
        }
        break;
      }
      default: {
        break;
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    return new NextResponse('Webhook handler error', { status: 500 });
  }
}

