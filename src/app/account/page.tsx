'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, ChevronDown, ChevronUp, MessageCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getTranslationHistory } from '@/lib/supabase';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { TranslationHistoryRow } from '@/lib/supabase';

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [history, setHistory] = useState<TranslationHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    getTranslationHistory(user.id, 50).then(setHistory);
  }, [user]);

  const deleteHistoryItem = async (id: string) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('translation_history').delete().eq('id', id);
    if (error) {
      console.error('Error deleting history item:', error);
      return;
    }
    setHistory((prev) => prev.filter((row) => row.id !== id));
    if (openId === id) {
      setOpenId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-pink-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-pink-50 px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Sign in to view your account</h2>
          <p className="text-gray-600 mb-6 text-sm">Your history and settings are saved when you’re signed in.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-rose-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to SayOK
          </Link>
        </div>
      </div>
    );
  }

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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Account card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border-2 border-orange-100 shadow-lg shadow-orange-100/30 p-5 sm:p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-orange-100 to-pink-100 rounded-xl flex items-center justify-center shrink-0">
              <User className="w-6 h-6 sm:w-7 sm:h-7 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Account</h1>
              <p className="text-gray-600 text-sm sm:text-base truncate max-w-[280px] sm:max-w-none" title={user.email ?? ''}>
                {user.email ?? 'Signed in with Google'}
              </p>
            </div>
          </div>
        </div>

        {/* History section */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-white rounded-xl border-2 border-orange-100 flex items-center justify-center shadow-sm">
            <MessageCircle className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">History</h2>
            <p className="text-xs sm:text-sm text-gray-500">Newest first. Tap an item to see details.</p>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="bg-white/80 rounded-2xl border-2 border-dashed border-orange-100 p-8 sm:p-10 text-center">
            <MessageCircle className="w-12 h-12 text-orange-200 mx-auto mb-3" />
            <p className="text-gray-600 font-medium mb-1">No history yet</p>
            <p className="text-sm text-gray-500 mb-6">Use SayOK on the home page — your results will show up here.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-100 text-orange-700 font-semibold rounded-xl hover:bg-orange-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Go to SayOK
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {history.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === row.id ? null : row.id)}
                  className="w-full text-left px-4 sm:px-5 py-3.5 sm:py-4 bg-white rounded-xl sm:rounded-2xl border-2 border-orange-100 hover:border-orange-200 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-orange-200 focus:ring-offset-2 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-800 font-semibold line-clamp-1 pr-2">{row.input_text}</span>
                      {openId === row.id ? (
                        <ChevronUp className="w-5 h-5 text-orange-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                      )}
                    </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {row.detected_language ?? '?'} → {row.target_language} · {new Date(row.created_at).toLocaleString()}
                  </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteHistoryItem(row.id);
                    }}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 shrink-0"
                    aria-label="Delete history item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
                {openId === row.id && (
                  <div className="mt-2 sm:mt-3 ml-0 sm:ml-4 pl-4 sm:pl-6 border-l-0 sm:border-l-2 border-orange-200 bg-white rounded-xl sm:rounded-2xl border-2 border-orange-100 p-4 sm:p-5 shadow-sm animate-fadeIn">
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-semibold text-gray-700">Input:</span> {row.input_text}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-semibold text-orange-700">Best:</span>{' '}
                      <span className="text-gray-800">{row.result?.best ?? row.result?.safe_option?.text ?? row.result?.summary ?? '—'}</span>
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-semibold text-emerald-700">Safe:</span>{' '}
                      <span className="text-gray-800">{row.result?.safe ?? row.result?.safe_option?.text ?? '—'}</span>
                    </p>
                    {row.result?.engaging ? (
                      <p className="text-sm text-gray-600 mb-2">
                        <span className="font-semibold text-pink-700">Engaging:</span>{' '}
                        <span className="text-gray-800">{row.result.engaging}</span>
                      </p>
                    ) : null}
                    {row.result?.sns ? (
                      <p className="text-sm text-gray-600 mb-2">
                        <span className="font-semibold text-violet-700">SNS:</span>{' '}
                        <span className="text-gray-800">{row.result.sns}</span>
                      </p>
                    ) : null}
                    {row.result?.variations && row.result.variations.length > 0 ? (
                      <div className="space-y-1.5 text-sm mb-2">
                        {row.result.variations.map((v, i) => (
                          <p key={i} className="text-gray-600">
                            <span className="font-medium text-purple-800">{v.type}:</span> {v.text ?? '—'}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {row.result?.alternatives && row.result.alternatives.length > 0 ? (
                      <div className="space-y-1.5 text-sm">
                        {row.result.alternatives.map((alt, i) => (
                          <p key={i} className="text-gray-600">
                            <span className="font-medium text-gray-700">{alt.label || `Option ${i + 1}`}:</span>{' '}
                            {alt.text ?? '—'}
                          </p>
                        ))}
                      </div>
                    ) : row.result?.rewrites && (
                      <div className="space-y-1.5 text-sm">
                        <p className="text-gray-600">
                          <span className="font-medium text-red-600">Strong:</span>{' '}
                          {row.result.rewrites.strong?.split('(')[0]?.trim() ?? '—'}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium text-blue-600">Casual:</span>{' '}
                          {row.result.rewrites.casual?.split('(')[0]?.trim() ?? '—'}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium text-purple-600">Soft:</span>{' '}
                          {row.result.rewrites.soft?.split('(')[0]?.trim() ?? '—'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 pt-6 border-t border-orange-100">
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
