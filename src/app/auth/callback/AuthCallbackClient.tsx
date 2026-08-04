'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'exchanging' | 'done' | 'error'>(supabase ? 'exchanging' : 'error');
  const [errorDetail, setErrorDetail] = useState<string | null>(supabase ? null : 'Supabase not configured');

  useEffect(() => {
    if (!supabase) return;

    const code = searchParams.get('code');
    const requestedNext = searchParams.get('next') || '/';
    const nextPath = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';
    const hash = typeof window !== 'undefined' ? window.location.hash : '';

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error('Auth callback error:', error);
          setErrorDetail(error.message);
          setStatus('error');
          return;
        }
        setStatus('done');
        window.location.href = nextPath;
      }).catch((err) => {
        setErrorDetail(err?.message ?? 'Exchange failed');
        setStatus('error');
      });
      return;
    }

    if (hash) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const err = params.get('error');
      const errDesc = params.get('error_description');
      if (err) {
        window.setTimeout(() => {
          setErrorDetail(errDesc || err);
          setStatus('error');
        }, 0);
        return;
      }
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
          if (error) {
            setErrorDetail(error.message);
            setStatus('error');
            return;
          }
          setStatus('done');
          window.location.href = nextPath;
        }).catch(() => setStatus('error'));
        return;
      }
    }

    // Check for error in query (e.g. Supabase returned error redirect)
    const qErr = searchParams.get('error');
    const qErrDesc = searchParams.get('error_description');
    if (qErr || qErrDesc) {
      window.setTimeout(() => {
        setErrorDetail(qErrDesc || qErr || 'Sign-in failed. Please try again.');
        setStatus('error');
      }, 0);
      return;
    }
    window.setTimeout(() => {
      setErrorDetail('No authorization code or tokens in the URL. Please try signing in again from the app.');
      setStatus('error');
    }, 0);
  }, [searchParams]);

  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-pink-50 px-4">
        <p className="text-gray-600">Signing you in…</p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-pink-50 px-4 py-6">
        <div className="text-center max-w-md w-full">
          <p className="text-red-600 font-semibold mb-2">Sign-in failed.</p>
          {errorDetail && <p className="text-sm text-gray-600 mb-4 break-words">{errorDetail}</p>}
          <Link href="/" className="inline-block mt-2 text-orange-600 hover:underline font-medium">Back to SayOK</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-pink-50 px-4">
      <p className="text-gray-600">Completing sign-in…</p>
    </div>
  );
}
