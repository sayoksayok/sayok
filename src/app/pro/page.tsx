'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as AuthUser } from '@supabase/supabase-js';

type BillingPlan = 'monthly' | 'yearly';

const features = [
  'Higher message limits for real work',
  'Pro tone variations for sensitive messages',
  'Extended history for repeated use',
  'Monthly or yearly subscription',
];

export default function ProPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
    });
  }, []);

  const handleUpgrade = async (plan: BillingPlan) => {
    setError('');

    if (!user) {
      window.location.href = '/';
      return;
    }

    setLoadingPlan(plan);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId: user.id }),
      });
      const data = await response.json();

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'Checkout is temporarily unavailable.');
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout is temporarily unavailable.');
      setLoadingPlan(null);
    }
  };

  return (
    <main className="min-h-screen bg-white text-[#1a1a18]">
      <header className="border-b border-[#042C53]/10 bg-white">
        <div className="mx-auto flex min-h-20 w-[min(1080px,calc(100%-32px))] items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 text-xl font-extrabold text-[#042C53]">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#185FA5] text-white">
              S
            </span>
            SayOK Pro
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#185FA5]">
            <ArrowLeft className="h-4 w-4" />
            Back to SayOK
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-[min(1080px,calc(100%-32px))] gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:py-24">
        <div>
          <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.08em] text-[#185FA5]">
            Subscription
          </p>
          <h1 className="mb-5 max-w-2xl text-4xl font-extrabold leading-tight tracking-[-0.02em] text-[#042C53] sm:text-5xl">
            Better messages when the message actually matters.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[#55544f]">
            SayOK Pro gives you higher limits, clearer tone options, and saved history so you can
            improve important messages without writing prompts from scratch.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="flex items-start gap-3 rounded-lg border border-[#042C53]/10 p-4">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#185FA5]" />
                <span className="font-semibold text-[#042C53]">{feature}</span>
              </div>
            ))}
          </div>

          {!user ? (
            <div className="mt-8 rounded-lg border border-[#185FA5]/20 bg-[#E6F1FB] p-4 text-sm font-semibold text-[#042C53]">
              Sign in first, then choose a Pro subscription.
            </div>
          ) : null}

          {error ? (
            <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4">
          <PricingCard
            title="Pro Monthly"
            price="$9"
            period="/ month"
            description="Flexible monthly billing. Good when you want to try Pro on real work."
            icon={<Zap className="h-5 w-5" />}
            loading={loadingPlan === 'monthly'}
            onClick={() => handleUpgrade('monthly')}
          />
          <PricingCard
            title="Pro Yearly"
            price="$90"
            period="/ year"
            description="Best value for daily use. Two months effectively free."
            icon={<Sparkles className="h-5 w-5" />}
            badge="Best value"
            featured
            loading={loadingPlan === 'yearly'}
            onClick={() => handleUpgrade('yearly')}
          />
          <div className="flex items-center gap-3 rounded-lg border border-[#042C53]/10 p-4 text-sm text-[#55544f]">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#185FA5]" />
            Payment is handled by Stripe. You can cancel from your subscription settings.
          </div>
        </div>
      </section>
    </main>
  );
}

function PricingCard({
  title,
  price,
  period,
  description,
  icon,
  badge,
  featured,
  loading,
  onClick,
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  featured?: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <article
      className={[
        'rounded-lg bg-white p-6 shadow-[0_14px_36px_rgba(4,44,83,0.06)]',
        featured ? 'border-2 border-[#185FA5]' : 'border border-[#042C53]/10',
      ].join(' ')}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E6F1FB] text-[#185FA5]">
            {icon}
          </span>
          <h2 className="text-xl font-extrabold text-[#042C53]">{title}</h2>
        </div>
        {badge ? (
          <span className="rounded-full bg-[#E6F1FB] px-3 py-1 text-xs font-extrabold text-[#185FA5]">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mb-3 flex items-baseline gap-2">
        <strong className="text-5xl font-extrabold leading-none text-[#185FA5]">{price}</strong>
        <span className="text-sm font-semibold text-[#888780]">{period}</span>
      </div>
      <p className="mb-6 leading-7 text-[#55544f]">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#185FA5] px-5 font-extrabold text-white transition hover:bg-[#042C53] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Start Pro
      </button>
    </article>
  );
}
