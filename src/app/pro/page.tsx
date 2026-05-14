'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Sparkles, Zap, History, MousePointer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as AuthUser } from '@supabase/supabase-js';

export default function ProPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
    });
  }, []);

  const handleUpgrade = async (plan: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) {
      // Redirect to home to sign in
      window.location.href = '/';
      return;
    }
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId: user.id }),
      });
      const data = await response.json();
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Upgrade error:', err);
    }
  };

  const features = [
    { icon: Zap, text: 'Best, Safe, Engaging + SNS when it fits', desc: 'Structured rewrites for DMs, email, and social—not a generic grammar checker.' },
    { icon: Sparkles, text: 'Pro tone variations', desc: 'Casual, emotional, and professional lines—clearly different, not tiny edits.' },
    { icon: Zap, text: 'Higher limits for real work', desc: 'Up to 2,000 characters per message and 100 server-tracked checks per day.' },
    { icon: History, text: 'Extended history', desc: '300 items—sidebar, reload, and delete.' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-pink-50">
      <header className="bg-white/90 backdrop-blur-xl border-b border-orange-100/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 bg-clip-text text-transparent hover:opacity-90 transition-opacity"
          >
            SayOK
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-18">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-orange-100 to-rose-100 text-orange-700 mb-4">
            For work
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-800 mb-3 tracking-tight">
            SayOK <span className="bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 bg-clip-text text-transparent">Pro</span>
          </h1>
          <p className="text-gray-600 text-lg sm:text-xl max-w-xl mx-auto mb-2">
            Unlock the full output stack—social-style rewrites when they fit, Pro variations, and higher daily limits enforced on the server.
          </p>
          <p className="text-gray-700 font-medium text-base sm:text-lg">
            Use this when the message actually matters.
          </p>
        </div>

        {/* Features */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-5 mb-10 sm:mb-14">
          {features.map(({ icon: Icon, text, desc }) => (
            <div
              key={text}
              className="flex gap-4 p-4 sm:p-5 bg-white rounded-2xl border-2 border-orange-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all"
            >
              <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-orange-100 to-pink-100 flex items-center justify-center">
                <Icon className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{text}</p>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mb-10 sm:mb-12">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Choose your plan</h2>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-white rounded-2xl border-2 border-orange-100 shadow-lg shadow-orange-100/20 p-6 sm:p-8 hover:border-orange-200 transition-colors">
              <p className="text-3xl sm:text-4xl font-extrabold text-gray-800">
                $9 <span className="text-lg font-normal text-gray-500">/ month</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">Billed monthly</p>
              <p className="text-sm text-gray-600 mt-4">Flexible. Cancel anytime.</p>
            </div>
            <div className="relative bg-white rounded-2xl border-2 border-orange-200 shadow-lg shadow-orange-100/30 p-6 sm:p-8 hover:border-orange-300 transition-colors">
              <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500 text-white">
                Save
              </span>
              <p className="text-3xl sm:text-4xl font-extrabold text-gray-800">
                $90 <span className="text-lg font-normal text-gray-500">/ year</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">Save when you pay yearly</p>
              <p className="text-sm text-emerald-600 font-medium mt-4">2 months free</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            type="button"
            onClick={() => handleUpgrade('monthly')}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 sm:py-5 bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 text-white font-bold rounded-2xl hover:from-orange-400 hover:via-pink-400 hover:to-rose-400 transition-all shadow-lg shadow-orange-200/40 hover:shadow-xl hover:shadow-orange-200/50 hover:-translate-y-0.5"
          >
            <Sparkles className="w-5 h-5" />
            Start Pro
          </button>
          <button
            type="button"
            onClick={() => handleUpgrade('yearly')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-600 font-semibold rounded-xl border border-orange-200 hover:bg-orange-50 transition-colors"
          >
            <Check className="w-4 h-4" />
            Choose yearly (save)
          </button>
        </div>

        <div className="mt-12 pt-8 border-t border-orange-100">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to SayOK
          </Link>
        </div>
      </main>
    </div>
  );
}
