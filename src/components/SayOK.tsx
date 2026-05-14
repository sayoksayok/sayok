'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Sparkles, Volume2, MessageCircle, LogOut, User, History, X, Trash2, Maximize2 } from 'lucide-react';
import { translations, languages, LanguageCode } from '@/lib/translations';
import { supabase, getTranslationHistory, checkAuthHealth } from '@/lib/supabase';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { TranslationHistoryRow } from '@/lib/supabase';

/** Strict API body (spec §3) + optional client-only detection from response header */
export interface SayOkResult {
  best: string;
  safe: string;
  engaging: string;
  sns: string;
  variations: { type: string; text: string }[];
  detected_language?: string;
}

export default function SayOK() {
  const [uiLang, setUiLang] = useState<LanguageCode>('en');
  const [targetLang, setTargetLang] = useState<string>('ja');
  const [outputLanguageCustom, setOutputLanguageCustom] = useState('');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SayOkResult | null>(null);
  const [error, setError] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showProSuccess, setShowProSuccess] = useState(false);
  const [expandModal, setExpandModal] = useState<{ title: string; text: string } | null>(null);
  const [history, setHistory] = useState<TranslationHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Character limits (spec §7): guest 500, logged free 600, pro 2000
  const charLimit = isPro ? 2000 : user ? 600 : 500;
  const overLimit = inputText.length > charLimit;
  const proOverLimit = isPro && inputText.length > 2000;

  const t = translations[uiLang] || translations.en;

  useEffect(() => {
    setUiLang('en');
    setTargetLang('ja');
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        client.from('users').upsert(
          { id: session.user.id, email: session.user.email ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        ).then(() => {});
        client.from('users').select('is_pro').eq('id', session.user.id).single().then(({ data }) => {
          setIsPro(data?.is_pro ?? false);
        });
      } else {
        setIsPro(false);
      }
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        client.from('users').upsert(
          { id: session.user.id, email: session.user.email ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        ).then(() => {});
        client.from('users').select('is_pro').eq('id', session.user.id).single().then(({ data }) => {
          setIsPro(data?.is_pro ?? false);
        });
      } else {
        setIsPro(false);
      }
      setShowLoginModal(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    setHistoryLoading(true);
    getTranslationHistory(user.id, 50).then((data) => {
      setHistory(data);
      setHistoryLoading(false);
    });
  }, [user]);

  // After successful Stripe payment: user is redirected to /?pro=1&session_id=...
  // Verify checkout directly so Pro activates even if webhook is delayed/misconfigured.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pro') !== '1') return;
    if (!user) return;

    const sessionId = params.get('session_id');
    const activate = async () => {
      if (sessionId) {
        try {
          const res = await fetch('/api/stripe/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId: user.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.verified) {
            setIsPro(true);
          }
        } catch (err) {
          console.error('Post-checkout verification failed:', err);
        }
      }

      setShowProSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    };

    void activate();
  }, [user]);

  // Refetch Pro status when we're showing success (webhook may have just updated the user)
  useEffect(() => {
    if (!showProSuccess || !user || !supabase) return;
    supabase.from('users').select('is_pro').eq('id', user.id).single().then(({ data }) => {
      if (data?.is_pro) setIsPro(true);
    });
  }, [showProSuccess, user]);

  useEffect(() => {
    if (!showAccountDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountDropdown]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleCheck = async () => {
    if (!inputText.trim()) return;
    if (overLimit) return;

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      let accessToken: string | undefined;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token;
      }

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputText,
          targetLang,
          accessToken,
          outputLanguageCustom: targetLang === 'other' ? outputLanguageCustom : undefined,
        }),
      });

      const detected =
        typeof response.headers.get === 'function'
          ? response.headers.get('X-SayOK-Detected-Language') || ''
          : '';
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        const msg = typeof data?.error === 'string' ? data.error : t.errorMessage;
        setError(msg);
        if (user && !isPro) setShowPricingModal(true);
        if (!user) setShowLoginModal(true);
        return;
      }

      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Could not improve this message');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const next: SayOkResult = {
        best: String(data.best ?? ''),
        safe: String(data.safe ?? ''),
        engaging: String(data.engaging ?? ''),
        sns: String(data.sns ?? ''),
        variations: Array.isArray(data.variations)
          ? data.variations.map((v: { type?: string; text?: string }) => ({
              type: String(v?.type || ''),
              text: String(v?.text || ''),
            }))
          : [],
        detected_language: detected || undefined,
      };
      setResult(next);
      setShowDiff(false);

      if (user && supabase) {
        const tl =
          targetLang === 'other'
            ? (outputLanguageCustom.trim() || 'other')
            : targetLang;
        supabase.from('translation_history').insert({
          user_id: user.id,
          input_text: inputText.trim(),
          detected_language: detected || null,
          target_language: tl,
          result: {
            best: next.best,
            safe: next.safe,
            engaging: next.engaging,
            sns: next.sns,
            variations: next.variations,
          }
        }).then(async () => {
          await trimHistoryForUser(user.id, isPro);
          getTranslationHistory(user.id, 50).then(setHistory);
        });
      }
    } catch (err) {
      console.error('Check error:', err);
      setError(err instanceof Error ? err.message : t.errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, index: number | string) => {
    const cleanText = text.trim();
    navigator.clipboard.writeText(cleanText);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSpeak = async (text: string, index: string) => {
    const cleanText = text.split('(')[0].trim();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setPlayingAudio(index);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, targetLang })
      });

      const data = await response.json();

      if (data.audioContent && !data.useBrowserTTS) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
        audioRef.current = audio;
        audio.onended = () => setPlayingAudio(null);
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          setPlayingAudio(null);
          useBrowserTTS(cleanText);
        };
        await audio.play();
      } else {
        useBrowserTTS(cleanText);
      }
    } catch (err) {
      console.error('TTS fetch error:', err);
      useBrowserTTS(cleanText);
    }
  };

  const useBrowserTTS = (text: string) => {
    if (!('speechSynthesis' in window)) {
      setPlayingAudio(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);

    const langMap: Record<string, string> = {
      ja: 'ja-JP',
      en: 'en-US',
      ko: 'ko-KR',
      es: 'es-ES',
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      fr: 'fr-FR',
      th: 'th-TH',
      vi: 'vi-VN'
    };
    utterance.lang = targetLang === 'other' ? 'en-US' : langMap[targetLang] || 'en-US';

    const targetPrefix = utterance.lang.split('-')[0];
    const bestVoice = voices.find(v => v.lang.startsWith(targetPrefix));
    if (bestVoice) utterance.voice = bestVoice;

    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => setPlayingAudio(null);
    utterance.onerror = () => setPlayingAudio(null);

    window.speechSynthesis.speak(utterance);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCheck();
    }
  };

  const handleLogin = async () => {
    if (!supabase) return;
    setAuthUnavailable(false);
    const ok = await checkAuthHealth();
    if (!ok) {
      setAuthUnavailable(true);
      return;
    }
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setShowAccountDropdown(false);
  };

  const handleUpgrade = async (plan: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) {
      setShowLoginModal(true);
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
      } else {
        setError(t.errorMessage);
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(t.errorMessage);
    }
  };

  function rowToResult(row: TranslationHistoryRow): SayOkResult | null {
    const r = row.result;
    if (!r) return null;
    if (typeof r.best === 'string' || typeof r.safe === 'string') {
      return {
        best: r.best || r.safe || '',
        safe: r.safe || '',
        engaging: r.engaging || '',
        sns: r.sns || '',
        variations: Array.isArray(r.variations)
          ? r.variations.map((v) => ({ type: String(v.type || ''), text: String(v.text || '') }))
          : [],
        detected_language: row.detected_language || undefined,
      };
    }
    if (r.safe_option?.text) {
      const txt = r.safe_option.text;
      return {
        best: txt,
        safe: txt,
        engaging: '',
        sns: '',
        variations: [],
        detected_language: row.detected_language || undefined,
      };
    }
    if (r.summary) {
      return {
        best: r.summary,
        safe: r.summary,
        engaging: '',
        sns: '',
        variations: [],
        detected_language: row.detected_language || undefined,
      };
    }
    return null;
  }

  function groupHistoryByDate(rows: TranslationHistoryRow[]) {
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 864e5).toDateString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 864e5).getTime();
    const groups: { label: string; rows: TranslationHistoryRow[] }[] = [];
    let todayRows: TranslationHistoryRow[] = [];
    let yesterdayRows: TranslationHistoryRow[] = [];
    let last7Rows: TranslationHistoryRow[] = [];
    let olderRows: TranslationHistoryRow[] = [];
    for (const row of rows) {
      const d = new Date(row.created_at);
      const ds = d.toDateString();
      if (ds === today) todayRows.push(row);
      else if (ds === yesterday) yesterdayRows.push(row);
      else if (d.getTime() >= sevenDaysAgo) last7Rows.push(row);
      else olderRows.push(row);
    }
    if (todayRows.length) groups.push({ label: 'Today', rows: todayRows });
    if (yesterdayRows.length) groups.push({ label: 'Yesterday', rows: yesterdayRows });
    if (last7Rows.length) groups.push({ label: 'Previous 7 Days', rows: last7Rows });
    if (olderRows.length) groups.push({ label: 'Older', rows: olderRows });
    return groups;
  }

  const selectHistoryItem = (row: TranslationHistoryRow) => {
    const res = rowToResult(row);
    if (res) {
      setInputText(row.input_text);
      setTargetLang(row.target_language);
      setResult(res);
      setShowDiff(false);
      setError('');
      setSidebarOpen(false);
    }
  };

  const historyGroups = groupHistoryByDate(history);

  /** Simple word-level diff for "Show changes": returns segments for original vs corrected. */
  function getWordDiff(original: string, corrected: string): { type: 'same' | 'removed' | 'added'; text: string }[] {
    const a = original.trim().split(/(\s+)/).filter(Boolean);
    const b = corrected.trim().split(/(\s+)/).filter(Boolean);
    const out: { type: 'same' | 'removed' | 'added'; text: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        out.push({ type: 'same', text: a[i] });
        i++;
        j++;
      } else if (j < b.length && (i >= a.length || !a.slice(i).includes(b[j]))) {
        out.push({ type: 'added', text: b[j] });
        j++;
      } else if (i < a.length && (j >= b.length || !b.slice(j).includes(a[i]))) {
        out.push({ type: 'removed', text: a[i] });
        i++;
      } else if (i < a.length && j < b.length) {
        out.push({ type: 'removed', text: a[i] });
        out.push({ type: 'added', text: b[j] });
        i++;
        j++;
      }
    }
    return out;
  }

  const trimHistoryForUser = async (userId: string, isProFlag: boolean) => {
    if (!supabase) return;
    const limit = isProFlag ? 300 : 30;
    const { data, error } = await supabase
      .from('translation_history')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(limit, limit + 999);
    if (error || !data || data.length === 0) return;
    await supabase
      .from('translation_history')
      .delete()
      .in(
        'id',
        (data as { id: string }[]).map((row) => row.id),
      );
  };

  const deleteHistoryItem = async (id: string) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('translation_history').delete().eq('id', id);
    if (error) {
      console.error('Error deleting history item:', error);
      return;
    }
    setHistory((prev) => prev.filter((row) => row.id !== id));
    if (result && result.best && history.some((row) => row.id === id && row.input_text === inputText)) {
      setResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-pink-50 overflow-x-hidden min-w-0 flex">
      {/* History sidebar (ChatGPT-style) - only when logged in */}
      {user && (
        <>
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/30 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <aside
            className={`flex flex-col w-72 lg:w-64 flex-shrink-0 bg-white/95 backdrop-blur border-r border-orange-100 shadow-sm top-0 left-0 h-full transition-transform duration-200 ease-out ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:translate-x-0 fixed lg:sticky z-50 lg:z-auto h-screen`}
          >
            <div className="p-3 border-b border-orange-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">History</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 rounded-lg hover:bg-orange-50 text-gray-500"
                aria-label="Close history"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 border-b border-orange-50">
              <button
                type="button"
                onClick={() => { setInputText(''); setResult(null); setError(''); setSidebarOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium text-sm"
              >
                <Sparkles className="w-4 h-4" />
                New check
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {historyLoading ? (
                <div className="py-6 text-center text-sm text-gray-500">Loading…</div>
              ) : history.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">No history yet</div>
              ) : (
                historyGroups.map((group) => (
                  <div key={group.label} className="mb-4">
                    <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.label}</p>
                    <ul className="space-y-0.5">
                      {group.rows.map((row) => (
                        <li key={row.id}>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => selectHistoryItem(row)}
                              className="flex-1 text-left px-3 py-2.5 rounded-lg hover:bg-orange-50 text-sm text-gray-700 truncate border border-transparent hover:border-orange-100"
                            >
                              <span className="font-medium truncate block">{row.input_text || '—'}</span>
                              <span className="text-xs text-gray-500">
                                {row.detected_language ?? '?'} → {row.target_language} · {new Date(row.created_at).toLocaleDateString()}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteHistoryItem(row.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                              aria-label="Delete history item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-orange-100/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {user && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-orange-50 text-gray-600 shrink-0"
                aria-label="Open history"
              >
                <History className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-lg sm:text-2xl font-extrabold bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 bg-clip-text text-transparent shrink-0">
              SayOK
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0">
            {user ? (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowAccountDropdown((v) => !v)}
                  className="px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-orange-600 border border-gray-200 hover:border-orange-300 rounded-lg bg-white transition-colors flex items-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-0"
                  aria-label="Account"
                >
                  <User className="w-4 h-4" />
                  Account
                </button>
                {showAccountDropdown && (
                  <div className="absolute right-0 top-full mt-1 py-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <a
                      href="/account"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-orange-50"
                      onClick={() => setShowAccountDropdown(false)}
                    >
                      <User className="w-4 h-4" />
                      Account
                    </a>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-orange-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-orange-600 border border-gray-200 hover:border-orange-300 rounded-lg bg-white transition-colors min-h-[44px] sm:min-h-0"
                aria-label="Login"
              >
                Login
              </button>
            )}
            <select
              value={uiLang}
              onChange={(e) => setUiLang(e.target.value as LanguageCode)}
              className="px-2 sm:px-3 py-2 border border-gray-200 rounded-lg focus:border-orange-400 focus:outline-none text-xs sm:text-sm bg-white cursor-pointer min-h-[44px] sm:min-h-0"
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Login modal */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => { setShowLoginModal(false); setAuthUnavailable(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="Sign in"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 mb-2">Sign in</h2>
            <p className="text-sm text-gray-500 mb-6">Use your Google account to save history and unlock Pro features.</p>
            {authUnavailable && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Sign-in is temporarily unavailable. Please try again in a few minutes.
              </div>
            )}
            {supabase ? (
              <button
                type="button"
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
            ) : (
              <p className="text-sm text-amber-600">Login is not configured. Add Supabase URL and anon key to enable.</p>
            )}
            <button
              type="button"
              onClick={() => setShowLoginModal(false)}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upgrade modal (e.g. when non-Pro clicks Rewrite) */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => setShowUpgradeModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Upgrade to Pro"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 mb-2">Upgrade to Pro</h2>
            <p className="text-sm text-gray-600 mb-6">SNS-style rewrites, Pro tone variations, and higher limits are included with Pro.</p>
            <button
              type="button"
              onClick={() => { setShowUpgradeModal(false); setShowPricingModal(true); }}
              className="block w-full text-center px-4 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-rose-400 transition-colors mb-3"
            >
              See Pricing
            </button>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pricing modal with monthly/yearly options */}
      {showPricingModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPricingModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Choose your plan"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">Choose Your Plan</h2>
            <p className="text-sm text-gray-600 mb-6 text-center">Unlock full outputs and higher daily limits</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Monthly Plan */}
              <div className="border-2 border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
                <h3 className="font-bold text-gray-800 mb-1">Monthly</h3>
                <div className="mb-3">
                  <span className="text-3xl font-extrabold text-gray-900">$9</span>
                  <span className="text-gray-500 text-sm">/month</span>
                </div>
                <ul className="text-xs text-gray-600 space-y-1 mb-4">
                  <li>• Up to 2,000 characters per message</li>
                  <li>• Best, Safe, Engaging + SNS when it fits</li>
                  <li>• Pro tone variations (casual, emotional, professional)</li>
                  <li>• 100 server-tracked checks/day · extended history</li>
                </ul>
                <button
                  type="button"
                  onClick={() => { setShowPricingModal(false); handleUpgrade('monthly'); }}
                  className="w-full py-2 px-4 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  Start Monthly
                </button>
              </div>
              
              {/* Yearly Plan */}
              <div className="border-2 border-orange-400 rounded-xl p-4 relative bg-gradient-to-br from-orange-50 to-amber-50">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  SAVE 17%
                </div>
                <h3 className="font-bold text-gray-800 mb-1">Yearly</h3>
                <div className="mb-1">
                  <span className="text-3xl font-extrabold text-gray-900">$90</span>
                  <span className="text-gray-500 text-sm">/year</span>
                </div>
                <p className="text-xs text-orange-600 font-medium mb-3">$7.50/month billed annually</p>
                <ul className="text-xs text-gray-600 space-y-1 mb-4">
                  <li>• Up to 2,000 characters per message</li>
                  <li>• Best, Safe, Engaging + SNS when it fits</li>
                  <li>• Pro tone variations (casual, emotional, professional)</li>
                  <li>• 100 server-tracked checks/day · extended history</li>
                </ul>
                <button
                  type="button"
                  onClick={() => { setShowPricingModal(false); handleUpgrade('yearly'); }}
                  className="w-full py-2 px-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-lg hover:from-orange-400 hover:to-rose-400 transition-colors text-sm"
                >
                  Start Yearly
                </button>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setShowPricingModal(false)}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success banner after Stripe payment */}
      {showProSuccess && (
        <div className="sticky top-0 z-40 bg-emerald-500 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
            <p className="font-semibold">
              Subscription complete — you&apos;re now SayOK Pro. Full output stack, higher limits, and extended history.
            </p>
            <button
              type="button"
              onClick={() => setShowProSuccess(false)}
              className="shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section - compact so input + button stay above fold */}
      <section className="relative bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSI0Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-16 sm:pb-20 lg:pb-24">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 lg:gap-8">
            <div className="flex flex-col items-center shrink-0">
              <div className="relative mb-2 sm:mb-3 animate-bounce" style={{ animationDuration: '3s' }}>
                <div className="bg-white text-gray-800 rounded-2xl px-3 sm:px-4 py-2 shadow-xl relative">
                  <p className="text-xs sm:text-sm font-semibold whitespace-nowrap">{t.characterLine}</p>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-white"></div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl sm:rounded-3xl blur-lg opacity-50 scale-110"></div>
                <img
                  src="/character.jpg"
                  alt="Say OK Character"
                  className="relative w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-2xl sm:rounded-3xl object-contain border-4 border-white shadow-2xl bg-gradient-to-br from-amber-50 to-orange-100"
                />
              </div>
            </div>

            <div className="text-center sm:text-left text-white max-w-md lg:max-w-lg">
              <h2 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-extrabold mb-2 sm:mb-3 leading-tight tracking-tight whitespace-normal">
                {t.heroTitle}
              </h2>
              <p className="text-sm sm:text-base lg:text-lg opacity-95 leading-relaxed font-medium">
                {t.heroSubtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-0 h-8 sm:h-10 lg:h-12">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0 40L60 35C120 30 240 20 360 15C480 10 600 10 720 12.5C840 15 960 20 1080 22.5C1200 25 1320 25 1380 25L1440 25V40H0Z" fill="rgb(255 251 235)"/>
          </svg>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 -mt-2 sm:-mt-4">
        <div className="xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:gap-8 xl:items-start">
          {/* Input Card */}
          <div className={`relative min-w-0 mb-6 sm:mb-8 ${!result && !error && !isLoading ? '' : 'xl:col-span-2'}`}>
            <div className="absolute inset-x-1 inset-y-0 bg-orange-200/50 rounded-2xl sm:rounded-3xl translate-y-3 -z-10"></div>
            <div className="absolute inset-x-0.5 inset-y-0 bg-orange-100/70 rounded-2xl sm:rounded-3xl translate-y-1.5 -z-10"></div>

            <div className="relative bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border-2 border-orange-200 shadow-[0_10px_40px_-10px_rgba(251,146,60,0.3)]">
            <div className="mb-4 sm:mb-6">
              <label className="block text-base sm:text-lg font-bold text-gray-800 mb-1 sm:mb-2">
                {t.inputLabel}
              </label>
              <p className="text-sm text-gray-500 mb-2" aria-describedby="input-helper">
                {(t as { inputHelper?: string }).inputHelper ?? "Paste your draft in any language. We'll show how natives would say it."}
              </p>
              <div className="relative" id="input-helper">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.inputPlaceholder}
                  className="w-full h-28 sm:h-32 lg:h-36 p-4 sm:p-5 border-2 border-gray-200 rounded-xl sm:rounded-2xl focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none resize-none text-base sm:text-lg transition-all placeholder:text-gray-400 shadow-inner bg-gray-50/50"
                />
                <p className={`mt-1.5 text-right text-xs ${overLimit ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                  {inputText.length} / {charLimit.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Language Selection */}
            <div className="relative mb-4 sm:mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-300/30 to-pink-300/30 rounded-xl sm:rounded-2xl translate-y-1.5"></div>

              <div className="relative bg-gradient-to-r from-orange-50 via-amber-50 to-pink-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 border-2 border-orange-200 shadow-[0_4px_20px_-4px_rgba(251,146,60,0.25)]">
                <div className="flex flex-col sm:flex-row xl:flex-col items-start sm:items-center xl:items-start justify-between gap-4 sm:gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md border-2 border-orange-100 transform hover:scale-105 transition-transform">
                      <span className="text-xl sm:text-2xl">📝</span>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-gray-500 font-medium">{t.inputLangLabel}</p>
                      <p className="font-bold text-gray-800 text-sm sm:text-base">{t.autoDetect}</p>
                    </div>
                  </div>

                  <div className="hidden sm:flex xl:hidden items-center justify-center w-12 h-12 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full shadow-lg transform hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>

                  <div className="w-full sm:w-auto xl:w-full sm:min-w-[220px] xl:min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md border-2 border-orange-100 shrink-0 transform hover:scale-105 transition-transform">
                        <span className="text-xl sm:text-2xl">🎯</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs sm:text-sm text-gray-500 font-medium mb-1">{t.targetLabel}</p>
                        <select
                          value={targetLang}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTargetLang(v);
                            if (v !== 'other') setOutputLanguageCustom('');
                          }}
                          className="w-full px-4 py-2.5 sm:py-3 border-2 border-orange-300 rounded-xl focus:border-orange-500 focus:outline-none font-bold bg-white text-sm sm:text-base transition-all hover:border-orange-400 shadow-sm"
                        >
                          {languages.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.code === 'other'
                                ? `${lang.flag} ${t.targetOtherOption}`
                                : `${lang.flag} ${lang.name}`}
                            </option>
                          ))}
                        </select>
                        {targetLang === 'other' ? (
                          <input
                            type="text"
                            value={outputLanguageCustom}
                            onChange={(e) => setOutputLanguageCustom(e.target.value)}
                            placeholder={t.targetOtherPlaceholder}
                            className="mt-2 w-full px-4 py-2.5 border-2 border-orange-200 rounded-xl focus:border-orange-500 focus:outline-none text-sm sm:text-base bg-white"
                            maxLength={120}
                            aria-label={t.targetOtherPlaceholder}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pro over safe limit: ask to split */}
            {proOverLimit && (
              <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 border-2 border-amber-200 bg-amber-50 mb-4">
                <p className="text-sm font-medium text-gray-800">This message is very long. For best results, split into sections.</p>
              </div>
            )}

            {/* Pro upsell banner when free user text is too long */}
            {overLimit && !isPro && (
              <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 border-2 border-amber-200 bg-amber-50 mb-4">
                <h3 className="font-bold text-gray-800 mb-1">This message is a bit long.</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {user
                    ? 'Signed-in free supports up to 600 characters. Pro supports up to 2,000 characters.'
                    : 'Without signing in, the limit is 500 characters. Sign in for 600, or upgrade to Pro for 2,000.'}
                </p>
                <button
                  type="button"
                  onClick={() => user ? setShowPricingModal(true) : setShowLoginModal(true)}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-lg hover:from-orange-400 hover:to-rose-400 transition-colors"
                >
                  Upgrade to Pro
                </button>
              </div>
            )}

            {/* Submit Button */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-rose-600 rounded-xl sm:rounded-2xl translate-y-1.5"></div>
              <button
                onClick={handleCheck}
                disabled={isLoading || !inputText.trim() || overLimit}
                className="relative w-full bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 hover:from-orange-400 hover:via-pink-400 hover:to-rose-400 disabled:from-gray-300 disabled:via-gray-300 disabled:to-gray-300 text-white font-bold py-4 sm:py-5 lg:py-6 rounded-xl sm:rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 sm:gap-3 shadow-lg hover:translate-y-0.5 hover:shadow-md active:translate-y-1 active:shadow-sm disabled:translate-y-0 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed text-base sm:text-lg"
              >
                {isLoading ? (
                  <>
                    <span className="animate-pulse">Thinking…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                    {t.checkButton}
                  </>
                )}
              </button>
            </div>
            {/* Loading state: character video animation */}
            {isLoading && (
              <div className="mt-4 flex flex-col items-center justify-center rounded-xl bg-orange-50 border-2 border-orange-100 py-3 px-4 animate-fadeIn">
                <video
                  src="/IMG_0470.MP4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover border-2 border-orange-200 overflow-hidden"
                  aria-hidden
                />
                <p className="mt-2 text-sm font-medium text-orange-800">Checking how natives say it…</p>
              </div>
            )}
            </div>
          </div>

          {/* Empty State in right desktop column */}
          {!result && !error && !isLoading && (
            <div className="relative min-w-0 xl:pt-2">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 bg-gradient-to-br from-orange-100 via-pink-50 to-amber-100 rounded-full blur-3xl opacity-60"></div>
              </div>

              <div className="relative text-center py-6 sm:py-8 lg:py-0">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl rotate-[-8deg] shadow-lg flex items-center justify-center animate-pulse">
                    <span className="text-white text-lg">?</span>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-500 rounded-2xl shadow-lg flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl rotate-[8deg] shadow-lg flex items-center justify-center animate-pulse" style={{ animationDelay: '0.5s' }}>
                    <span className="text-white text-lg">!</span>
                  </div>
                </div>

                <h2 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-orange-600 via-pink-600 to-rose-600 bg-clip-text text-transparent mb-2">
                  {t.emptyStateTitle}
                </h2>
                <p className="text-sm sm:text-base text-gray-500 font-medium mb-6">
                  {t.emptyStateDesc}
                </p>

                <div className="bg-white/80 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border border-orange-100 w-full overflow-hidden">
                  <p className="text-xs sm:text-sm md:text-base font-bold text-gray-700 mb-3 sm:mb-4">{t.howToUse}</p>

                  <div className="flex flex-col sm:flex-row sm:justify-between gap-3 sm:gap-2">
                    <div className="flex sm:flex-col items-center gap-2 sm:gap-1.5 text-left sm:text-center flex-1 min-w-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        <span className="text-white text-xs sm:text-sm font-bold">1</span>
                      </div>
                      <p className="text-xs sm:text-xs md:text-sm text-gray-600">{t.howToUseStep1}</p>
                    </div>

                    <div className="hidden sm:flex items-center text-orange-300 shrink-0 px-1">
                      <span className="text-base">→</span>
                    </div>

                    <div className="flex sm:flex-col items-center gap-2 sm:gap-1.5 text-left sm:text-center flex-1 min-w-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        <span className="text-white text-xs sm:text-sm font-bold">2</span>
                      </div>
                      <p className="text-xs sm:text-xs md:text-sm text-gray-600">{t.howToUseStep2}</p>
                    </div>

                    <div className="hidden sm:flex items-center text-orange-300 shrink-0 px-1">
                      <span className="text-base">→</span>
                    </div>

                    <div className="flex sm:flex-col items-center gap-2 sm:gap-1.5 text-left sm:text-center flex-1 min-w-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-rose-400 to-red-500 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        <span className="text-white text-xs sm:text-sm font-bold">3</span>
                      </div>
                      <p className="text-xs sm:text-xs md:text-sm text-gray-600">{t.howToUseStep3}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-6 sm:mb-8 animate-shake">
            <p className="text-red-700 font-medium text-sm sm:text-base">{error}</p>
          </div>
        )}

        {/* Results — spec §8 */}
        {result && (
          <div className="space-y-4 sm:space-y-6 animate-fadeIn min-w-0">
            {([
              { key: 'best' as const, title: t.blockBestTitle, desc: t.blockBestDesc, text: result.best, primary: true },
              { key: 'safe' as const, title: t.blockSafeTitle, desc: t.blockSafeDesc, text: result.safe, primary: false },
              ...(result.engaging.trim()
                ? [{ key: 'engaging' as const, title: t.blockEngagingTitle, desc: t.blockEngagingDesc, text: result.engaging, primary: false }]
                : []),
              ...(result.sns.trim()
                ? [{ key: 'sns' as const, title: t.blockSnsTitle, desc: '', text: result.sns, primary: false }]
                : []),
            ]).map((block) => (
              <div
                key={block.key}
                className={`rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 lg:p-8 border-2 min-w-0 ${
                  block.primary
                    ? 'border-orange-400 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3 min-w-0">
                  <div className="min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">{block.title}</h3>
                    {block.desc ? <p className="text-xs sm:text-sm text-gray-600">{block.desc}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(block.text, block.key)}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                        copiedIndex === block.key
                          ? 'bg-orange-500 text-white'
                          : 'bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200'
                      }`}
                    >
                      {copiedIndex === block.key ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedIndex === block.key ? t.copied : t.copy}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSpeak(block.text, block.key)}
                      className={`p-2.5 rounded-xl text-orange-700 hover:bg-orange-100 border border-orange-200 ${
                        playingAudio === block.key ? 'bg-orange-100' : ''
                      }`}
                      aria-label="Listen"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                    {block.text.length > 320 ? (
                      <button
                        type="button"
                        onClick={() => setExpandModal({ title: block.title, text: block.text })}
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50"
                      >
                        <Maximize2 className="w-4 h-4" />
                        {t.expand}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[350px] overflow-y-auto min-w-0 pr-1">
                  <p className="text-base sm:text-lg lg:text-xl text-gray-900 font-semibold leading-relaxed whitespace-pre-wrap break-words">
                    {block.text}
                  </p>
                </div>
                {block.key === 'best' ? (
                  <div className="mt-4 pt-4 border-t border-orange-200">
                    <button
                      type="button"
                      onClick={() => setShowDiff((d) => !d)}
                      className="text-sm font-semibold text-orange-800 hover:underline"
                    >
                      {showDiff ? t.hideChanges : t.showChanges}
                    </button>
                    {showDiff && (
                      <div className="mt-3 p-3 rounded-xl bg-white/80 border border-orange-100 text-sm animate-fadeIn">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Original → Best</p>
                        <div className="leading-relaxed break-words">
                          {getWordDiff(inputText.trim(), result.best).map((seg, i) => (
                            <span
                              key={i}
                              className={
                                seg.type === 'removed'
                                  ? 'bg-red-100 text-red-700 line-through decoration-2'
                                  : seg.type === 'added'
                                    ? 'bg-emerald-100 text-emerald-800 font-medium'
                                    : 'text-gray-700'
                              }
                            >
                              {seg.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}

            {isPro && result.variations.some((v) => v.text.trim()) ? (
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg border-2 border-purple-100 p-4 sm:p-6 lg:p-8 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">{t.variationsTitle}</h3>
                <div className="space-y-4">
                  {result.variations
                    .filter((v) => v.text.trim())
                    .map((v) => {
                      const label =
                        v.type === 'casual'
                          ? t.variationCasual
                          : v.type === 'emotional'
                            ? t.variationEmotional
                            : v.type === 'professional'
                              ? t.variationProfessional
                              : v.type;
                      const vid = `var-${v.type}`;
                      return (
                        <div key={v.type} className="rounded-xl border border-purple-100 bg-purple-50/40 p-4 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-2">
                            <p className="font-bold text-purple-900">{label}</p>
                            <div className="flex gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopy(v.text, vid)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold bg-purple-100 text-purple-800 hover:bg-purple-200"
                              >
                                {copiedIndex === vid ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copiedIndex === vid ? t.copied : t.copy}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSpeak(v.text, vid)}
                                className="p-2 rounded-lg text-purple-800 hover:bg-purple-100"
                                aria-label="Listen"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="max-h-[350px] overflow-y-auto min-w-0">
                            <p className="text-gray-900 whitespace-pre-wrap break-words leading-relaxed">{v.text}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Upgrade to Pro card under results for non-Pro */}
        {result && !isPro && (
          <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 rounded-2xl sm:rounded-3xl border-2 border-orange-200 shadow-lg p-4 sm:p-6 lg:p-8 mt-6 animate-fadeIn">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-3">Upgrade to Pro (for work)</h3>
            <ul className="list-disc list-inside text-sm sm:text-base text-gray-600 mb-4 space-y-1">
              <li>Engaging + social-style (SNS) rewrites when they fit</li>
              <li>Pro tone variations (casual, emotional, professional)</li>
              <li>Up to 2,000 characters and 100 checks per day</li>
              <li>Extended history (300 items)</li>
            </ul>
            <button
              type="button"
              onClick={() => user ? setShowPricingModal(true) : setShowLoginModal(true)}
              className="inline-flex items-center justify-center px-5 py-3 bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 text-white font-bold rounded-xl hover:from-orange-400 hover:via-pink-400 hover:to-rose-400 transition-colors"
            >
              Upgrade to Pro
            </button>
          </div>
        )}

      </main>

      {expandModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setExpandModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label={expandModal.title}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-gray-900">{expandModal.title}</h2>
              <button
                type="button"
                onClick={() => setExpandModal(null)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label={t.expandClose}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0">
              <p className="text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{expandModal.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-orange-100 bg-white/50 py-4 mt-4 sm:mt-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400 text-xs sm:text-sm">
            © 2026 say ok?
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
