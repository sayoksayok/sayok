'use client'

import type { Session, User } from '@supabase/supabase-js'
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import SalesAgent from '@/components/SalesAgent'
import { checkAuthHealth, getAuthCallbackUrl, supabase } from '@/lib/supabase'

type GmailStatus = {
  connected: boolean
  canSend: boolean
  googleEmail: string | null
  needsReauth?: boolean
}

const allowedEmail = (process.env.NEXT_PUBLIC_SALES_AGENT_ALLOWED_EMAIL || 'yudai@looq.icu').toLowerCase()

export default function SalesAgentGate() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>({
    connected: false,
    canSend: false,
    googleEmail: null,
  })

  const authenticatedFetch = useCallback(async (path: string, init?: RequestInit) => {
    if (!supabase) throw new Error('ログイン機能が設定されていません。')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。')
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(path, { ...init, headers })
  }, [])

  const loadGmailStatus = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/sales-agent/google/status', { cache: 'no-store' })
      if (!response.ok) return
      setGmailStatus((await response.json()) as GmailStatus)
    } catch {
      setGmailStatus({ connected: false, canSend: false, googleEmail: null })
    }
  }, [authenticatedFetch])

  const persistGoogleConnection = useCallback(async (session: Session) => {
    if (!session.provider_token) {
      await loadGmailStatus()
      return
    }

    const response = await authenticatedFetch('/api/sales-agent/google/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: session.provider_token,
        refreshToken: session.provider_refresh_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Gmail送信権限を保存できませんでした。')
      await loadGmailStatus()
      return
    }
    setGmailStatus(data as GmailStatus)
  }, [authenticatedFetch, loadGmailStatus])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      const nextUser = data.session?.user || null
      setUser(nextUser)
      setLoading(false)
      if (data.session && nextUser?.email?.toLowerCase() === allowedEmail) {
        void persistGoogleConnection(data.session)
      }
    }).catch(() => {
      setError('ログイン状態を確認できませんでした。')
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setLoading(false)
      if (session?.user.email?.toLowerCase() === allowedEmail) {
        window.setTimeout(() => void persistGoogleConnection(session), 0)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [persistGoogleConnection])

  async function signInWithGoogle() {
    if (!supabase) return
    setBusy(true)
    setError('')

    const healthy = await checkAuthHealth()
    if (!healthy) {
      setBusy(false)
      setError('現在ログインサーバーへ接続できません。設定を確認してください。')
      return
    }

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthCallbackUrl('/'),
        scopes: [
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/calendar.readonly',
        ].join(' '),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          login_hint: allowedEmail,
        },
      },
    })

    if (signInError) {
      setBusy(false)
      setError(`Googleログインを開始できませんでした: ${signInError.message}`)
    }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setGmailStatus({ connected: false, canSend: false, googleEmail: null })
  }

  if (loading) {
    return <GateMessage title="SayOKを開いています" body="安全なログイン状態を確認しています。" />
  }

  if (!supabase) {
    return <GateMessage title="ログイン設定が必要です" body="Supabaseの公開URLと匿名キーを設定すると、この非公開画面を利用できます。" />
  }

  const email = user?.email?.toLowerCase() || ''
  if (user && email !== allowedEmail) {
    return (
      <main className="min-h-screen bg-[#f2f3f0] px-4 py-12 text-[#20242b]">
        <section className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-8 shadow-sm">
          <ShieldCheck className="h-9 w-9 text-[#bc3f34]" />
          <p className="mt-5 text-xs font-black tracking-[0.16em] text-[#bc3f34]">ACCESS DENIED</p>
          <h1 className="mt-2 text-3xl font-black">この営業画面はYudai専用です。</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-[#5f656c]">
            {email} ではアクセスできません。{allowedEmail} でログインしてください。
          </p>
          <button type="button" onClick={signOut} className="mt-6 w-full rounded-md bg-[#2b4c7e] px-5 py-3 text-sm font-black text-white">
            ログアウトしてやり直す
          </button>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f2f3f0] px-4 py-12 text-[#20242b]">
        <section className="mx-auto max-w-lg rounded-xl border border-[#d9dbd5] bg-[#fbfbf9] p-8 shadow-sm sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#bc3f34] text-[#bc3f34]">
            <LockKeyhole size={22} />
          </div>
          <p className="mt-6 text-xs font-black tracking-[0.16em] text-[#bc3f34]">SAYOK PRIVATE SALES</p>
          <h1 className="mt-3 text-4xl font-black leading-tight">ログインした本人だけが見られる営業画面。</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-[#5f656c]">
            営業先、公開連絡先、作成済みメール、送信操作はログイン後にだけ表示されます。
          </p>
          <div className="mt-6 rounded-lg border border-[#d9dbd5] bg-white p-4 text-sm font-bold">
            <div className="flex items-center gap-2"><Mail size={17} className="text-[#2b4c7e]" /> 送信元: {allowedEmail}</div>
            <div className="mt-2 flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-700" /> 承認後のみGmail送信</div>
          </div>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="mt-6 w-full rounded-md bg-[#2b4c7e] px-5 py-4 text-sm font-black text-white hover:bg-[#1e3a63] disabled:opacity-50"
          >
            {busy ? '接続を確認しています…' : `${allowedEmail} でGoogleログイン`}
          </button>
          {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        </section>
      </main>
    )
  }

  return (
    <SalesAgent
      userEmail={email}
      gmailConnected={gmailStatus.connected && gmailStatus.canSend}
      onReconnectGoogle={signInWithGoogle}
      onSignOut={signOut}
    />
  )
}

function GateMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f3f0] px-4 text-[#20242b]">
      <section className="w-full max-w-md rounded-xl border border-[#d9dbd5] bg-white p-8 text-center shadow-sm">
        <LockKeyhole className="mx-auto h-9 w-9 text-[#2b4c7e]" />
        <h1 className="mt-5 text-2xl font-black">{title}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#6b7076]">{body}</p>
      </section>
    </main>
  )
}
