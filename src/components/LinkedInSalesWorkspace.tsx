'use client'

import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Linkedin,
  MessageSquareText,
  RefreshCw,
  Send,
  UserRoundSearch,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type LinkedInProspect = {
  id: string
  organization: string
  website: string
  reason: string
  sourceUrl: string
  contactName: string
  contactTitle: string
  linkedinUrl: string
}

type Product = 'DOGEDAY' | 'ALTLIER' | 'LOOQ'
type Status = 'not_started' | 'prepared' | 'sent' | 'replied' | 'meeting' | 'snoozed' | 'dismissed'

type ProspectState = {
  profileUrl: string
  profileContext: string
  connectionNote: string
  firstMessage: string
  followUp: string
  status: Status
  sentAt: string
  followUpAt: string
}

type ActivityItem = {
  lead_id?: string
  channel?: string
  status?: Status
  profile_url?: string
  follow_up_at?: string
  createdAt?: string
}

type Props = {
  userId: string
  product: Product
  prospects: LinkedInProspect[]
  senderName: string
  senderCompany: string
  offering: string
  serviceNote: string
  language: 'English' | 'Japanese'
}

const emptyState: ProspectState = {
  profileUrl: '',
  profileContext: '',
  connectionNote: '',
  firstMessage: '',
  followUp: '',
  status: 'not_started',
  sentAt: '',
  followUpAt: '',
}

export default function LinkedInSalesWorkspace({
  userId,
  product,
  prospects,
  senderName,
  senderCompany,
  offering,
  serviceNote,
  language,
}: Props) {
  const storageKey = `sayok:linkedin-sales:v1:${userId}:${product}`
  const [states, setStates] = useState<Record<string, ProspectState>>({})
  const [loadedKey, setLoadedKey] = useState('')
  const [busyId, setBusyId] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expandedId, setExpandedId] = useState('')

  useEffect(() => {
    setLoadedKey('')
    setStates({})
    setExpandedId('')
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setStates(JSON.parse(saved) as Record<string, ProspectState>)
    } catch {
      localStorage.removeItem(storageKey)
    } finally {
      setLoadedKey(storageKey)
    }
  }, [storageKey])

  useEffect(() => {
    if (loadedKey !== storageKey) return
    localStorage.setItem(storageKey, JSON.stringify(states))
  }, [loadedKey, states, storageKey])

  useEffect(() => {
    if (loadedKey !== storageKey || !supabase) return
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return
        const response = await fetch('/api/sales-agent/channel-activity', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (!response.ok) return
        const payload = (await response.json()) as { items?: ActivityItem[] }
        const latest = new Map<string, ActivityItem>()
        for (const item of payload.items || []) {
          if (item.channel === 'linkedin' && item.lead_id && !latest.has(item.lead_id)) latest.set(item.lead_id, item)
        }
        if (cancelled || !latest.size) return
        setStates((current) => {
          const next = { ...current }
          for (const [leadId, item] of latest) {
            const existing = next[leadId] || emptyState
            next[leadId] = {
              ...existing,
              status: item.status || existing.status,
              profileUrl: item.profile_url || existing.profileUrl,
              followUpAt: item.follow_up_at || existing.followUpAt,
              sentAt: item.status === 'sent' ? item.createdAt || existing.sentAt : existing.sentAt,
            }
          }
          return next
        })
      } catch {
        // Local state remains usable when activity sync is temporarily unavailable.
      }
    })()
    return () => { cancelled = true }
  }, [loadedKey, storageKey])

  const dueFollowUps = useMemo(() => prospects.filter((prospect) => {
    const state = states[prospect.id]
    return state?.status === 'sent' && state.followUpAt && new Date(state.followUpAt).getTime() <= Date.now()
  }), [prospects, states])

  const preparedCount = prospects.filter((prospect) => Boolean(states[prospect.id]?.firstMessage)).length
  const sentCount = prospects.filter((prospect) => ['sent', 'replied', 'meeting'].includes(states[prospect.id]?.status)).length
  const repliedCount = prospects.filter((prospect) => ['replied', 'meeting'].includes(states[prospect.id]?.status)).length

  function getState(id: string) {
    return states[id] || emptyState
  }

  function updateState(id: string, patch: Partial<ProspectState>) {
    setStates((current) => ({
      ...current,
      [id]: { ...(current[id] || emptyState), ...patch },
    }))
  }

  async function authenticatedFetch(path: string, init?: RequestInit) {
    if (!supabase) throw new Error('ログイン機能が設定されていません。')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('ログインの有効期限が切れました。')
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(path, { ...init, headers })
  }

  async function generate(prospect: LinkedInProspect) {
    if (!senderName.trim() || !senderCompany.trim()) {
      setError('先に差出人の氏名と会社名を入力してください。')
      return
    }
    const state = getState(prospect.id)
    setBusyId(prospect.id)
    setError('')
    setNotice('')
    try {
      const response = await authenticatedFetch('/api/sales-agent/linkedin-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          company: prospect.organization,
          website: prospect.website,
          reason: prospect.reason,
          contactName: prospect.contactName,
          contactTitle: prospect.contactTitle,
          profileText: state.profileContext,
          senderName,
          senderCompany,
          offering,
          serviceNote,
          language,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'LinkedIn文面を作成できませんでした。')
      updateState(prospect.id, { ...data.draft, status: 'prepared' })
      setExpandedId(prospect.id)
      setNotice(`${prospect.organization}向けのLinkedIn文面を作成しました。`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LinkedIn文面を作成できませんでした。')
    } finally {
      setBusyId('')
    }
  }

  async function record(prospect: LinkedInProspect, status: Exclude<Status, 'not_started' | 'prepared'>, message = '') {
    const state = getState(prospect.id)
    const now = new Date().toISOString()
    const followUpAt = status === 'sent'
      ? state.followUpAt || addBusinessDays(5)
      : status === 'snoozed'
        ? addBusinessDays(3)
        : state.followUpAt

    setBusyId(`record-${prospect.id}`)
    setError('')
    try {
      const response = await authenticatedFetch('/api/sales-agent/channel-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: prospect.id,
          organization: prospect.organization,
          channel: 'linkedin',
          status,
          profileUrl: state.profileUrl,
          followUpAt,
          message,
          product,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || '営業履歴を保存できませんでした。')
      updateState(prospect.id, {
        status,
        followUpAt,
        sentAt: status === 'sent' ? now : state.sentAt,
      })
      setNotice(statusNotice(status, prospect.organization, followUpAt))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '営業履歴を保存できませんでした。')
    } finally {
      setBusyId('')
    }
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  return (
    <div className="grid gap-5">
      <section className="border border-[#cfd2cc] bg-white p-5 sm:p-6" aria-labelledby="linkedin-workspace-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.13em] text-[#0a66c2]">LINKEDIN SALES</p>
            <h2 id="linkedin-workspace-heading" className="mt-1 text-2xl font-black">LinkedIn営業を止めずに進める</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#626970]">
              プロフィールURLと必要な情報を保存し、接続文・初回DM・フォローを作成します。送信はLinkedIn上で本人が行い、SayOKには結果と次回日だけを記録します。
            </p>
          </div>
          <div className="grid grid-cols-3 border border-[#d9dbd5] bg-[#f8f9f7]">
            <Metric value={preparedCount} label="準備済み" />
            <Metric value={sentCount} label="送信済み" />
            <Metric value={repliedCount} label="返信" />
          </div>
        </div>
      </section>

      {dueFollowUps.length > 0 && (
        <section className="border-2 border-[#bc3f34] bg-[#fff8f5] p-5" aria-label="今日のLinkedInフォロー">
          <div className="flex items-center gap-2 text-[#a3362d]">
            <CalendarClock size={18} />
            <h3 className="font-black">今日フォローする {dueFollowUps.length}件</h3>
          </div>
          <div className="mt-4 grid gap-2">
            {dueFollowUps.map((prospect) => {
              const state = getState(prospect.id)
              return (
                <div key={prospect.id} className="flex flex-col gap-3 border border-[#ead6cf] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black">{prospect.organization}</p>
                    <p className="text-xs font-semibold text-[#6b7076]">{state.followUpAt ? formatDate(state.followUpAt) : '今日'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => copyText(`follow-${prospect.id}`, state.followUp)} disabled={!state.followUp}>
                      <Clipboard size={14} /> {copied === `follow-${prospect.id}` ? 'コピー済み' : 'フォローをコピー'}
                    </SmallButton>
                    <SmallButton onClick={() => openLinkedIn(state.profileUrl)} disabled={!isLinkedInUrl(state.profileUrl)}>
                      <ExternalLink size={14} /> LinkedInで開く
                    </SmallButton>
                    <SmallButton onClick={() => void record(prospect, 'snoozed')}>
                      3営業日延ばす
                    </SmallButton>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {error && <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>}
      {notice && <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</p>}

      {!prospects.length ? (
        <section className="border border-dashed border-[#c9ccc6] bg-white px-6 py-10 text-center">
          <UserRoundSearch className="mx-auto text-[#737980]" size={28} />
          <p className="mt-3 font-black">先に営業先候補を探してください。</p>
        </section>
      ) : prospects.map((prospect) => {
        const state = getState(prospect.id)
        const expanded = expandedId === prospect.id
        return (
          <article key={prospect.id} className="border border-[#cfd2cc] bg-white">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Linkedin size={18} className="text-[#0a66c2]" />
                  <h3 className="text-lg font-black">{prospect.organization}</h3>
                  <StatusPill status={state.status} />
                </div>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#626970]">{prospect.reason}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-[#2b4c7e]">
                  <a href={prospect.website} target="_blank" rel="noreferrer" className="underline">公式サイト</a>
                  <a href={prospect.sourceUrl} target="_blank" rel="noreferrer" className="underline">候補の根拠</a>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? '' : prospect.id)}
                className="shrink-0 border border-[#cfd2cc] bg-white px-4 py-2 text-sm font-black hover:border-[#0a66c2] hover:text-[#0a66c2]"
              >
                {expanded ? '閉じる' : state.firstMessage ? '文面を開く' : 'LinkedIn営業を準備'}
              </button>
            </div>

            {expanded && (
              <div className="border-t border-[#d9dbd5] bg-[#f8f9f7] p-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-2 text-sm font-black">
                    LinkedInプロフィールURL
                    <input
                      className="field-input"
                      type="url"
                      placeholder="https://www.linkedin.com/in/..."
                      value={state.profileUrl || prospect.linkedinUrl}
                      onChange={(event) => updateState(prospect.id, { profileUrl: event.target.value })}
                    />
                    <span className="text-xs font-semibold text-[#70767c]">SayOKはLinkedInを自動取得しません。本人が確認したURLを保存します。</span>
                  </label>
                  <label className="grid gap-2 text-sm font-black">
                    相手について使う情報
                    <textarea
                      className="field-textarea min-h-28"
                      placeholder="役職、プロフィールの要点、投稿、会った場所など。貼った事実だけを文面に使います。"
                      value={state.profileContext}
                      onChange={(event) => updateState(prospect.id, { profileContext: event.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <SmallButton onClick={() => openLinkedInSearch(prospect, product)}>
                    <UserRoundSearch size={14} /> LinkedInで担当者を探す
                  </SmallButton>
                  <button
                    type="button"
                    onClick={() => void generate(prospect)}
                    disabled={busyId === prospect.id}
                    className="inline-flex items-center gap-2 bg-[#0a66c2] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    {busyId === prospect.id ? <RefreshCw className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                    {state.firstMessage ? '文面を作り直す' : '3つの文面を作る'}
                  </button>
                  <SmallButton onClick={() => openLinkedIn(state.profileUrl || prospect.linkedinUrl)} disabled={!isLinkedInUrl(state.profileUrl || prospect.linkedinUrl)}>
                    <ExternalLink size={14} /> LinkedInで開く
                  </SmallButton>
                </div>

                {state.firstMessage && (
                  <div className="mt-5 grid gap-4">
                    <MessageEditor
                      label="接続リクエスト"
                      value={state.connectionNote}
                      maxLength={280}
                      copied={copied === `connect-${prospect.id}`}
                      onChange={(value) => updateState(prospect.id, { connectionNote: value })}
                      onCopy={() => copyText(`connect-${prospect.id}`, state.connectionNote)}
                    />
                    <MessageEditor
                      label="接続後の初回DM"
                      value={state.firstMessage}
                      copied={copied === `first-${prospect.id}`}
                      onChange={(value) => updateState(prospect.id, { firstMessage: value })}
                      onCopy={() => copyText(`first-${prospect.id}`, state.firstMessage)}
                    />
                    <MessageEditor
                      label="返信がない時のフォロー"
                      value={state.followUp}
                      copied={copied === `follow-edit-${prospect.id}`}
                      onChange={(value) => updateState(prospect.id, { followUp: value })}
                      onCopy={() => copyText(`follow-edit-${prospect.id}`, state.followUp)}
                    />

                    <div className="flex flex-col gap-3 border-t border-[#d9dbd5] pt-4 sm:flex-row sm:items-end sm:justify-between">
                      <label className="grid gap-1 text-xs font-black">
                        次回フォロー日
                        <input
                          type="date"
                          className="border border-[#cfd2cc] bg-white px-3 py-2 text-sm"
                          value={toDateInput(state.followUpAt)}
                          onChange={(event) => updateState(prospect.id, { followUpAt: fromDateInput(event.target.value) })}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <SmallButton
                          onClick={() => void record(prospect, 'sent', state.firstMessage)}
                          disabled={busyId === `record-${prospect.id}`}
                        >
                          <Send size={14} /> LinkedInで送信済みにする
                        </SmallButton>
                        <SmallButton onClick={() => void record(prospect, 'replied')}>
                          <Check size={14} /> 返信あり
                        </SmallButton>
                        <SmallButton onClick={() => void record(prospect, 'meeting')}>
                          <CheckCircle2 size={14} /> ミーティング化
                        </SmallButton>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-20 border-r border-[#d9dbd5] px-3 py-2 text-center last:border-r-0">
      <p className="text-lg font-black">{value}</p>
      <p className="text-[10px] font-black tracking-[0.08em] text-[#6b7076]">{label}</p>
    </div>
  )
}

function MessageEditor({
  label,
  value,
  copied,
  maxLength,
  onChange,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  maxLength?: number
  onChange: (value: string) => void
  onCopy: () => void
}) {
  return (
    <label className="grid gap-2 border border-[#d9dbd5] bg-white p-4 text-sm font-black">
      <span className="flex items-center justify-between gap-3">
        {label}
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-black text-[#0a66c2]">
          <Clipboard size={13} /> {copied ? 'コピー済み' : 'コピー'}
        </button>
      </span>
      <textarea
        className="min-h-28 resize-y border-0 bg-transparent text-sm font-medium leading-6 outline-none"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
      {maxLength && <span className="text-right text-[11px] font-bold text-[#7b8187]">{value.length} / {maxLength}</span>}
    </label>
  )
}

function SmallButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 border border-[#cfd2cc] bg-white px-3 py-2 text-xs font-black text-[#343a40] hover:border-[#0a66c2] hover:text-[#0a66c2] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function StatusPill({ status }: { status: Status }) {
  const labels: Record<Status, string> = {
    not_started: '未着手',
    prepared: '文面準備済み',
    sent: '返信待ち',
    replied: '返信あり',
    meeting: 'ミーティング化',
    snoozed: '保留',
    dismissed: '対象外',
  }
  const active = ['replied', 'meeting'].includes(status)
  return <span className={`px-2.5 py-1 text-xs font-black ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-[#eef2f7] text-[#40536c]'}`}>{labels[status]}</span>
}

function isLinkedInUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'))
  } catch {
    return false
  }
}

function openLinkedIn(value: string) {
  if (isLinkedInUrl(value)) window.open(value, '_blank', 'noopener,noreferrer')
}

function openLinkedInSearch(prospect: LinkedInProspect, product: Product) {
  const roleHints: Record<Product, string> = {
    DOGEDAY: 'partnerships sponsorship marketing community',
    ALTLIER: 'Japan APAC growth partnerships country manager',
    LOOQ: 'digital signage OOH media retail innovation',
  }
  const knownContact = [prospect.contactName, prospect.contactTitle].filter(Boolean).join(' ')
  const query = [prospect.organization, knownContact || roleHints[product]].filter(Boolean).join(' ')
  const url = new URL('https://www.linkedin.com/search/results/people/')
  url.searchParams.set('keywords', query)
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

function addBusinessDays(days: number) {
  const date = new Date()
  let remaining = days
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1
  }
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }).format(new Date(value))
}

function toDateInput(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function fromDateInput(value: string) {
  return value ? new Date(`${value}T09:00:00+09:00`).toISOString() : ''
}

function statusNotice(status: Status, organization: string, followUpAt: string) {
  if (status === 'sent') return `${organization}を送信済みにしました。${followUpAt ? `${formatDate(followUpAt)}にフォローします。` : ''}`
  if (status === 'replied') return `${organization}からの返信を記録しました。`
  if (status === 'meeting') return `${organization}とのミーティング化を記録しました。`
  if (status === 'snoozed') return `${organization}のフォローを3営業日延ばしました。`
  return `${organization}の状態を更新しました。`
}
