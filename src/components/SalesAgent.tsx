'use client'

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FilePenLine,
  History,
  LogOut,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Contact, Lead, LeadDiscoveryResult } from '@/lib/lead-types'
import { supabase } from '@/lib/supabase'

type SiteAnalysis = {
  company: string
  offering: string
  valueProp: string
  idealCustomerProfile: string[]
  searchKeywords: string[]
}

export type SenderProfile = {
  senderName: string
  senderCompany: string
  senderAddress: string
  senderContact: string
  websiteUrl: string
  salesDeckUrl: string
  attachLooqDeck: boolean
  serviceNote: string
  tone: string
  language: 'English' | 'Japanese'
}

type Draft = {
  subject: string
  body: string
  state: 'ready' | 'sending' | 'sent'
}

type BulkTemplate = {
  subject: string
  body: string
}

type Validation = {
  ok: boolean
  flags: string[]
}

type LeadView = {
  lead: Lead
  contact: Contact | null
  validation: Validation
}

type SendHistoryItem = {
  id: string
  organization: string
  toEmail: string
  subject: string
  sourceUrl: string
  sentAt: string
  fromEmail: string
  gmailMessageId: string
}

const LEGACY_STORAGE_KEY = 'sayok:sales-agent:v1'
const STORAGE_KEY = 'sayok:sales-agent:v2'
const LEGACY_PROFILE_KEY = 'sayok:sales-profile:v2'
const PROFILE_KEY = 'sayok:sales-profile:v3'
const BULK_CONFIRM_ID = '__bulk_send__'
const BULK_TEMPLATE_VERSION = 4
const LEAD_QUALITY_VERSION = 2
const SALES_DECK_DRIVE_URL = 'https://drive.google.com/file/d/1p5NZiJnWU2CrnBmn2tb82iZbre7W0x9G/view?usp=sharing'
const DOGEDAY_DECK_DRIVE_URL = 'https://drive.google.com/file/d/1_wuTyBDHFicPemao96BZ6k0w14mXD2IN/view?usp=sharing'

const looqBulkTemplate: BulkTemplate = {
  subject: '{{会社名}}様｜屋外広告の効果測定について',
  body: `{{宛名}}

はじめてご連絡いたします。{{自社名}}の{{差出人名}}と申します。

貴社の公式サイトを拝見し、屋外・交通広告を中心にメディア事業を展開されていることを確認しました。

弊社では、実際に広告が表示された内容をフィールドで確認したうえで、その周辺の歩行者数・滞留時間・反応を集計し、信頼水準・除外条件・品質条件を明記した一本の測定レポートとして納品するサービスを提供しています。

貴社のようなメディア事業者様にとって、掲出実績と現地の行動データを一つのレポートで示せることは、広告枠の価格根拠や媒体提案の説得力につながると考えています。

まずは15〜20分ほどお時間をいただき、現在の効果測定に関するお悩みをお聞かせいただけますでしょうか。

LOOQ Japan ウェブサイト：
https://www.looq.jp/

サービス資料（Google Drive）：
${SALES_DECK_DRIVE_URL}

同じ資料「LOOQ_pitchdeck_JP.pdf」も添付しております。`,
}

const genericBulkTemplate: BulkTemplate = {
  subject: '{{会社名}}様｜お取り組みについてのご提案',
  body: `{{宛名}}

はじめてご連絡いたします。{{自社名}}の{{差出人名}}と申します。

貴社の公式サイトを拝見し、ご連絡いたしました。

弊社では、{{提案内容}}を提供しています。貴社のお取り組みにお役立ていただける可能性があると考えております。

まずは15〜20分ほどお時間をいただき、現在のお悩みやお取り組みについてお聞かせいただけますでしょうか。`,
}

const dogeDayBulkTemplate: BulkTemplate = {
  subject: 'DOGE DAY 2026 partnership idea for {{会社名}}',
  body: `Hi {{宛名}},

I am {{差出人名}} from {{自社名}}, the steward of the original Doge IP.

We are preparing DOGE DAY 2026 in Japan around Kabosu's birthday and the global Doge community. The program combines community experiences, internet-culture guests, VIP networking, media moments, and brand activations.

Based on {{会社名}}'s work, we believe there may be a credible fit around community engagement, a branded activation, content, or a broader partnership. We would rather shape one relevant idea with your team than send a generic sponsorship package.

Would you be open to a short call to see whether DOGE DAY fits your 2026 brand or partnership priorities? If someone else owns sponsorships, community, or brand partnerships, a pointer would be appreciated.

The partnership deck is linked below.`,
}

const emptyProfile: SenderProfile = {
  senderName: '',
  senderCompany: '',
  senderAddress: '',
  senderContact: '',
  websiteUrl: '',
  salesDeckUrl: '',
  attachLooqDeck: false,
  serviceNote: '',
  tone: 'Professional, concise, and human',
  language: 'Japanese',
}

const steps = [
  ['一', '自社を知る'],
  ['二', '相手を探す'],
  ['三', '文を書く'],
  ['四', '承認して送る'],
] as const

type SalesAgentProps = {
  userId: string
  userEmail: string
  userName: string
  initialProfile?: Partial<SenderProfile>
  gmailConnected: boolean
  googleAuthEnabled: boolean
  onReconnectGoogle: () => void
  onSignOut: () => void
}

export default function SalesAgent({ userId, userEmail, userName, initialProfile, gmailConnected, googleAuthEnabled, onReconnectGoogle, onSignOut }: SalesAgentProps) {
  const defaultProfile = useMemo(
    () => profileForUser(userEmail, userName, initialProfile),
    [initialProfile, userEmail, userName],
  )
  const defaultBulkTemplate = useMemo(() => bulkTemplateForUser(userEmail), [userEmail])
  const storageKey = `${STORAGE_KEY}:${userId}`
  const profileKey = `${PROFILE_KEY}:${userId}`
  const [step, setStep] = useState(1)
  const [siteUrl, setSiteUrl] = useState('')
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null)
  const [targetMarket, setTargetMarket] = useState('')
  const [goal, setGoal] = useState('')
  const [hint, setHint] = useState('')
  const [count, setCount] = useState(8)
  const [result, setResult] = useState<LeadDiscoveryResult | null>(null)
  const [profile, setProfile] = useState<SenderProfile>(defaultProfile)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [bulkTemplate, setBulkTemplate] = useState<BulkTemplate>(defaultBulkTemplate)
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [draftingId, setDraftingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmId, setConfirmId] = useState('')
  const [copied, setCopied] = useState('')
  const [hydratedStorageKey, setHydratedStorageKey] = useState('')
  const [sendHistory, setSendHistory] = useState<SendHistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyBusy, setHistoryBusy] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [verifiedLeadImport, setVerifiedLeadImport] = useState('')
  const [profileSaveBusy, setProfileSaveBusy] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const hydrated = hydratedStorageKey === storageKey

  useEffect(() => {
    setHydratedStorageKey('')
    setStep(1)
    setSiteUrl('')
    setAnalysis(null)
    setTargetMarket('')
    setGoal('')
    setHint('')
    setCount(8)
    setResult(null)
    setProfile(defaultProfile)
    setDrafts({})
    setBulkTemplate(defaultBulkTemplate)
    setExcludedIds([])
    setBusy('')
    setDraftingId('')
    setError('')
    setNotice('')
    setConfirmId('')
    setCopied('')
    setSendHistory([])
    setHistoryOpen(false)
    setHistoryBusy(true)
    setHistoryError('')
    setVerifiedLeadImport('')
    setProfileSaveBusy(false)
    setProfileSaved(false)

    try {
      const legacyProfile = userEmail === 'yudai@looq.icu'
        ? localStorage.getItem(`${LEGACY_PROFILE_KEY}:${userId}`) || localStorage.getItem(LEGACY_PROFILE_KEY)
        : null
      const savedProfile = localStorage.getItem(profileKey) || legacyProfile
      if (savedProfile) setProfile({ ...defaultProfile, ...JSON.parse(savedProfile) })
    } catch {
      localStorage.removeItem(profileKey)
    }

    try {
      const legacyWorkspace = userEmail === 'yudai@looq.icu'
        ? localStorage.getItem(`${LEGACY_STORAGE_KEY}:${userId}`) || localStorage.getItem(LEGACY_STORAGE_KEY)
        : null
      const savedWorkspace = localStorage.getItem(storageKey) || legacyWorkspace
      if (savedWorkspace) {
        const saved = JSON.parse(savedWorkspace) as {
          step?: number
          siteUrl?: string
          analysis?: SiteAnalysis
          targetMarket?: string
          goal?: string
          hint?: string
          count?: number
          result?: LeadDiscoveryResult
          drafts?: Record<string, Draft>
          bulkTemplate?: BulkTemplate
          bulkTemplateVersion?: number
          leadQualityVersion?: number
          excludedIds?: string[]
        }
        const currentLeadQuality = saved.leadQualityVersion === LEAD_QUALITY_VERSION
        if (saved.step && saved.step >= 1 && saved.step <= 4) {
          setStep(!currentLeadQuality && saved.step > 2 ? 2 : saved.step)
        }
        setSiteUrl(saved.siteUrl || '')
        setAnalysis(saved.analysis || null)
        setTargetMarket(saved.targetMarket || '')
        setGoal(saved.goal || '')
        setHint(saved.hint || '')
        if (saved.count && [5, 8, 10, 14].includes(saved.count)) setCount(saved.count)
        setResult(currentLeadQuality ? saved.result || null : null)
        setDrafts(currentLeadQuality
          ? Object.fromEntries(Object.entries(saved.drafts || {}).map(([leadId, draft]) => [leadId, draft]))
          : {})
        setBulkTemplate(saved.bulkTemplateVersion === BULK_TEMPLATE_VERSION
          ? { ...defaultBulkTemplate, ...saved.bulkTemplate }
          : defaultBulkTemplate)
        setExcludedIds(currentLeadQuality ? saved.excludedIds || [] : [])
      }
    } catch {
      localStorage.removeItem(storageKey)
    } finally {
      setHydratedStorageKey(storageKey)
    }
  }, [defaultBulkTemplate, defaultProfile, profileKey, storageKey, userEmail])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(profileKey, JSON.stringify(profile))
  }, [hydrated, profile, profileKey])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(storageKey, JSON.stringify({
      step,
      siteUrl,
      analysis,
      targetMarket,
      goal,
      hint,
      count,
      result,
      drafts,
      bulkTemplate,
      bulkTemplateVersion: BULK_TEMPLATE_VERSION,
      leadQualityVersion: LEAD_QUALITY_VERSION,
      excludedIds,
    }))
  }, [hydrated, step, siteUrl, analysis, targetMarket, goal, hint, count, result, drafts, bulkTemplate, excludedIds, storageKey])

  useEffect(() => {
    if (!hydrated) return
    if (!supabase) {
      setHistoryBusy(false)
      setHistoryError('送信履歴を確認できないため、営業メールの作成を停止しています。')
      return
    }
    let cancelled = false
    setHistoryBusy(true)
    setHistoryError('')

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error('送信履歴を取得するには再ログインしてください。')
        const response = await fetch('/api/sales-agent/history', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = (await response.json()) as { items?: SendHistoryItem[]; error?: string }
        if (!response.ok) throw new Error(result.error || '送信履歴を取得できませんでした。')
        if (!cancelled) setSendHistory(result.items || [])
      } catch (err) {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : '送信履歴を取得できませんでした。')
      } finally {
        if (!cancelled) setHistoryBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hydrated, historyRefreshKey])

  const leadViews = useMemo(() => {
    if (!result) return []
    return result.leads.map((lead) => {
      const contacts = result.contacts
        .filter((contact) => contact.leadId === lead.id)
        .sort((a, b) => contactScore(b) - contactScore(a))
      const contact = contacts.find((candidate) => validateContact(candidate, lead, targetMarket).ok) || contacts[0] || null
      return { lead, contact, validation: validateContact(contact, lead, targetMarket) }
    })
  }, [result, targetMarket])

  const sentHistoryByEmail = useMemo(
    () => new Map(sendHistory.map((item) => [item.toEmail.trim().toLowerCase(), item])),
    [sendHistory],
  )
  const accepted = historyBusy || historyError ? [] : leadViews.filter((item) => (
    item.validation.ok
    && !excludedIds.includes(item.lead.id)
    && !getSentHistory(item, sentHistoryByEmail)
  ))
  const visibleProspects = leadViews.filter((item) => !excludedIds.includes(item.lead.id))
  const needsContact = visibleProspects.filter((item) => !item.validation.ok)
  const sentProspects = visibleProspects.filter((item) => Boolean(getSentHistory(item, sentHistoryByEmail)))
  const manuallyExcluded = leadViews.filter((item) => excludedIds.includes(item.lead.id))
  const drafted = accepted.filter((item) => Boolean(drafts[item.lead.id]))
  const readyToSend = drafted.filter((item) => drafts[item.lead.id]?.state === 'ready')
  const profileComplete = Boolean(
    profile.senderName.trim()
    && profile.senderCompany.trim()
    && profile.senderAddress.trim()
    && profile.senderContact.trim(),
  )

  async function apiFetch(path: string, init?: RequestInit) {
    if (!supabase) throw new Error('ログイン機能が設定されていません。')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。')
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(path, { ...init, headers })
  }

  async function saveProfile() {
    if (!profileComplete) {
      setError('氏名・会社名・事業者住所・連絡先を入力してください。')
      return
    }
    if (profile.websiteUrl.trim() && !isPublicUrl(normalizeUrl(profile.websiteUrl))) {
      setError('自社ウェブサイトのURLを確認してください。')
      return
    }
    if (profile.salesDeckUrl.trim() && !isPublicUrl(normalizeUrl(profile.salesDeckUrl))) {
      setError('営業資料URLを確認してください。')
      return
    }
    if (!supabase) {
      setError('ログイン機能が設定されていません。')
      return
    }

    setProfileSaveBusy(true)
    setProfileSaved(false)
    setError('')
    const normalizedProfile = {
      ...profile,
      websiteUrl: profile.websiteUrl.trim() ? normalizeUrl(profile.websiteUrl) : '',
      salesDeckUrl: profile.salesDeckUrl.trim() ? normalizeUrl(profile.salesDeckUrl) : '',
      attachLooqDeck: profile.attachLooqDeck && userEmail.endsWith('@looq.icu'),
    }
    const { error: saveError } = await supabase.auth.updateUser({
      data: { sales_profile: normalizedProfile },
    })
    setProfileSaveBusy(false)
    if (saveError) {
      setError(`差出人情報を保存できませんでした: ${saveError.message}`)
      return
    }
    setProfile(normalizedProfile)
    setProfileSaved(true)
    setNotice('差出人情報をこのGoogleアカウント専用に保存しました。')
  }

  async function analyzeSite() {
    if (!siteUrl.trim()) return
    setBusy('analyze')
    setError('')
    setNotice('')
    try {
      const response = await apiFetch('/api/sales-agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: normalizeUrl(siteUrl) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'サイトを分析できませんでした。')
      setSiteUrl(normalizeUrl(siteUrl))
      setAnalysis(data.analysis as SiteAnalysis)
      setResult(null)
      setDrafts({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'サイトを分析できませんでした。')
    } finally {
      setBusy('')
    }
  }

  async function findLeads() {
    if (!analysis || !targetMarket.trim() || !goal.trim()) {
      setError('ターゲット市場と営業目的を入力してください。')
      return
    }
    setBusy('search')
    setError('')
    setNotice('')
    try {
      const response = await apiFetch('/api/lead-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: normalizeUrl(siteUrl),
          targetMarket: targetMarket.trim(),
          goal: [
            goal.trim(),
            `Ideal customers: ${analysis.idealCustomerProfile.join(' / ')}`,
            hint.trim() ? `Additional conditions: ${hint.trim()}` : '',
          ].filter(Boolean).join('. '),
          maxLeads: count,
          senderProfile: `${profile.senderName} — ${profile.senderCompany}`,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '見込み客を探せませんでした。')
      setResult(data as LeadDiscoveryResult)
      setDrafts({})
      setExcludedIds([])
      setNotice('検索が完了しました。出典を確認できる連絡先だけを送信候補にしています。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '見込み客を探せませんでした。')
    } finally {
      setBusy('')
    }
  }

  function importVerifiedLeads() {
    const rows = verifiedLeadImport
      .split(/\r?\n/)
      .map((line) => line.split('\t').map((value) => value.trim()))
      .filter((columns) => columns.some(Boolean))

    if (!rows.length) {
      setError('公式サイトで確認した営業先を1行以上入力してください。')
      return
    }

    const importedAt = new Date().toISOString()
    const leads: Lead[] = []
    const contacts: Contact[] = []
    const errors: string[] = []

    rows.forEach(([organizationName, websiteValue, emailValue, sourceValue, reasonValue], index) => {
      const website = normalizeUrl(websiteValue || '')
      const sourceUrl = normalizeUrl(sourceValue || '')
      const email = (emailValue || '').toLowerCase()
      const websiteDomain = registeredDomain(safeHost(website))
      const sourceDomain = registeredDomain(safeHost(sourceUrl))
      const emailDomain = registeredDomain(email.split('@')[1] || '')
      const rowNumber = index + 1

      if (!organizationName || !isPublicUrl(website) || !isPublicUrl(sourceUrl) || !isValidEmail(email)) {
        errors.push(`${rowNumber}行目: 会社名・公式URL・メール・出典URLを確認してください。`)
        return
      }
      if (!emailDomain || websiteDomain !== emailDomain || sourceDomain !== emailDomain) {
        errors.push(`${rowNumber}行目: 公式サイト・メール・出典の企業ドメインが一致しません。`)
        return
      }

      const leadId = `verified-${email.replace(/[^a-z0-9]+/g, '-')}`
      leads.push({
        id: leadId,
        organizationName,
        organizationWebsite: website,
        category: 'Official website verified',
        country: targetMarket.trim() || 'Japan',
        reasonForFit: reasonValue || '公式サイトで事業内容と一般・法人向け代表メールを確認しました。',
        sourceUrl,
        confidence: 0.95,
        status: 'outreach_ready',
      })
      contacts.push({
        id: `${leadId}-contact`,
        leadId,
        name: '',
        title: 'ご担当者様',
        email,
        emailStatus: 'verified',
        linkedinUrl: '',
        sourceUrl,
        confidence: 0.98,
      })
    })

    if (errors.length) {
      setError(errors.join(' / '))
      return
    }

    const previousLeads = result?.leads || []
    const previousContacts = result?.contacts || []
    const importedEmails = new Set(contacts.map((contact) => contact.email.toLowerCase()))
    const importedLeadIds = new Set(contacts.map((contact) => contact.leadId))
    setResult({
      id: result?.id || `verified-import-${Date.now()}`,
      createdAt: result?.createdAt || importedAt,
      input: result?.input || {
        websiteUrl: normalizeUrl(siteUrl),
        targetMarket: targetMarket.trim() || 'Japan',
        goal: goal.trim(),
        maxLeads: rows.length,
      },
      analysis: result?.analysis || {
        product: analysis?.offering || '',
        targetAudience: analysis?.idealCustomerProfile.join(' / ') || '',
        positioning: analysis?.valueProp || '',
        businessModel: '',
        searchQueries: [],
      },
      leads: [
        ...previousLeads.filter((lead) => !importedLeadIds.has(lead.id)),
        ...leads,
      ],
      contacts: [
        ...previousContacts.filter((contact) => !importedEmails.has(contact.email.toLowerCase())),
        ...contacts,
      ],
      outreach: result?.outreach || [],
      integrationStatus: result?.integrationStatus || {
        firecrawl: 'manual_verified_import',
        brave: 'manual_verified_import',
        hunter: 'not_used',
        apollo: 'not_used',
        llm: 'not_used',
      },
      warnings: result?.warnings || [],
    })
    setExcludedIds((ids) => ids.filter((id) => !importedLeadIds.has(id)))
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([leadId]) => !importedLeadIds.has(leadId))))
    setVerifiedLeadImport('')
    setError('')
    setNotice(`${leads.length}社を公式サイト確認済みの営業先として追加しました。`)
  }

  async function createDraft(item: LeadView) {
    if (!analysis) return
    if (!profile.senderName.trim() || !profile.senderCompany.trim()) {
      setError('先に差出人の氏名と会社名を入力してください。')
      return
    }
    setDraftingId(item.lead.id)
    setError('')
    try {
      const response = await apiFetch('/api/sales-agent/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: cleanOrganizationName(item.lead),
          website: item.lead.organizationWebsite,
          reason: item.lead.reasonForFit,
          evidence: item.lead.sourceUrl,
          contactTitle: item.contact?.title,
          senderName: profile.senderName,
          senderCompany: profile.senderCompany,
          offering: analysis.offering,
          valueProp: analysis.valueProp,
          serviceNote: profile.serviceNote,
          senderWebsite: profile.websiteUrl,
          salesDeckUrl: profile.salesDeckUrl,
          attachLooqDeck: profile.attachLooqDeck && userEmail.endsWith('@looq.icu'),
          tone: profile.tone,
          language: profile.language,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '文面を作成できませんでした。')
      setDrafts((current) => ({
        ...current,
        [item.lead.id]: { ...data.draft, state: 'ready' },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '文面を作成できませんでした。')
    } finally {
      setDraftingId('')
    }
  }

  async function createAllDrafts() {
    setBusy('draft-all')
    setError('')
    for (const item of accepted) {
      if (!drafts[item.lead.id]) await createDraft(item)
    }
    setBusy('')
  }

  function applyBulkTemplate() {
    if (!bulkTemplate.subject.trim() || !bulkTemplate.body.trim()) {
      setError('一括テンプレの件名と本文を入力してください。')
      return
    }

    const inferredLanguage: SenderProfile['language'] = /[ぁ-んァ-ヶ一-龠々]/.test(bulkTemplate.body) ? 'Japanese' : 'English'
    if (profile.language !== inferredLanguage) setProfile((current) => ({ ...current, language: inferredLanguage }))
    const targets = accepted.filter((item) => drafts[item.lead.id]?.state !== 'sent')
    setDrafts((current) => {
      const next = { ...current }
      for (const item of targets) {
        next[item.lead.id] = {
          subject: personalizeTemplate(bulkTemplate.subject, item, profile, analysis),
          body: personalizeTemplate(bulkTemplate.body, item, profile, analysis),
          state: 'ready',
        }
      }
      return next
    })
    setError('')
    setNotice(`${targets.length}社分の宛名・会社名を差し替えて、テンプレを反映しました。`)
  }

  async function sendEmail(item: LeadView, options?: { silent?: boolean }): Promise<string | null> {
    const contact = item.contact
    const draft = drafts[item.lead.id]
    if (!contact?.email || !draft) return '宛先または下書きがありません。'
    if (!gmailConnected) {
      const message = '送信前にGmail送信権限を再接続してください。'
      if (!options?.silent) setError(message)
      setConfirmId('')
      return message
    }

    const fullBody = `${prepareSalesBody(draft.body, profile)}\n\n${buildFooter(profile)}`
    setDrafts((current) => ({
      ...current,
      [item.lead.id]: { ...draft, state: 'sending' },
    }))
    setError('')
    setNotice('')

    try {
      const response = await apiFetch('/api/sales-agent/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contact.email,
          subject: draft.subject,
          body: fullBody,
          organization: cleanOrganizationName(item.lead),
          sourceUrl: contact.sourceUrl,
          approvedBy: userEmail,
          confirmed: true,
          confirmationText: 'APPROVE_AND_SEND',
          attachLooqDeck: profile.attachLooqDeck && userEmail.endsWith('@looq.icu'),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Gmail送信に失敗しました。')
      setDrafts((current) => ({
        ...current,
        [item.lead.id]: { ...draft, state: 'sent' },
      }))
      setHistoryRefreshKey((key) => key + 1)
      if (!options?.silent) setNotice(`${cleanOrganizationName(item.lead)} へ ${userEmail} から送信しました。`)
      setConfirmId('')
      return null
    } catch (err) {
      setDrafts((current) => ({
        ...current,
        [item.lead.id]: { ...draft, state: 'ready' },
      }))
      const message = err instanceof Error ? err.message : 'Gmail送信に失敗しました。'
      if (!options?.silent) setError(message)
      return message
    }
  }

  async function sendAllReadyEmails() {
    if (!gmailConnected) {
      setError('送信前にGmail送信権限を再接続してください。')
      setConfirmId('')
      return
    }
    if (!readyToSend.length) return

    setBusy('send-all')
    setError('')
    setNotice('')
    setConfirmId('')
    let sent = 0
    const failures: string[] = []
    for (const item of readyToSend) {
      const failure = await sendEmail(item, { silent: true })
      if (failure) failures.push(`${cleanOrganizationName(item.lead)}: ${failure}`)
      else sent += 1
    }
    setBusy('')
    if (sent) setNotice(`${sent}通を ${userEmail} から送信しました。`)
    if (failures.length) setError(`${failures.length}通を送信できませんでした。${failures.join(' / ')}`)
  }

  function resetWorkspace() {
    if (!window.confirm('現在の分析・リード・下書きを消して、新しく始めますか？')) return
    localStorage.removeItem(storageKey)
    setStep(1)
    setSiteUrl('')
    setAnalysis(null)
    setTargetMarket('')
    setGoal('')
    setHint('')
    setResult(null)
    setDrafts({})
    setBulkTemplate(defaultBulkTemplate)
    setExcludedIds([])
    setError('')
    setNotice('')
  }

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  function exportCsv() {
    if (!result) return
    const rows = [
      ['Organization', 'Website', 'Reason', 'Lead source', 'Contact status', 'Contact', 'Title', 'Email', 'Email source', 'Draft subject'],
      ...leadViews.map((item) => [
        cleanOrganizationName(item.lead),
        item.lead.organizationWebsite,
        item.lead.reasonForFit,
        item.lead.sourceUrl,
        excludedIds.includes(item.lead.id) ? 'Manually excluded' : item.validation.ok ? 'Verified email' : 'Contact details unconfirmed',
        item.contact?.name || '',
        item.contact?.title || '',
        item.validation.ok ? item.contact?.email || '' : '',
        item.validation.ok ? item.contact?.sourceUrl || '' : '',
        drafts[item.lead.id]?.subject || '',
      ]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sayok-outreach-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#f2f3f0] text-[#20242b]">
      <header className="border-b border-[#d9dbd5] bg-[#fbfbf9]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#bc3f34] font-serif text-xs font-bold text-[#bc3f34]">
              OK
            </div>
            <div className="min-w-0">
              <p className="text-lg font-black">SayOK</p>
              <p className="truncate text-xs font-semibold text-[#6b7076]">見込み客発掘・営業メールエージェント</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-black text-[#20242b]">{userEmail}</p>
              <p className={`text-[11px] font-bold ${gmailConnected ? 'text-emerald-700' : googleAuthEnabled ? 'text-[#bc3f34]' : 'text-amber-700'}`}>
                {gmailConnected ? 'Gmail送信 接続済み' : googleAuthEnabled ? 'Gmail再接続が必要' : 'Gmail送信 設定中'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold ${
                historyOpen
                  ? 'border-[#2b4c7e] bg-[#eef2f7] text-[#2b4c7e]'
                  : 'border-[#d9dbd5] bg-white text-[#4f555c] hover:border-[#2b4c7e]'
              }`}
            >
              <History size={15} /> 送信履歴 {historyBusy ? '…' : sendHistory.length}
            </button>
            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-md border border-[#d9dbd5] bg-white px-3 py-2 text-xs font-bold text-[#4f555c] hover:border-[#2b4c7e]"
            >
              新しく始める
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="ログアウト"
              className="rounded-md border border-[#d9dbd5] bg-white p-2 text-[#4f555c] hover:border-[#bc3f34] hover:text-[#bc3f34]"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:grid-cols-4 sm:px-6" aria-label="営業工程">
          {steps.map(([number, label], index) => {
            const itemStep = index + 1
            const active = step === itemStep
            const complete = step > itemStep
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(itemStep)}
                className={`border-b-3 px-2 py-3 text-left text-sm font-bold transition ${
                  active
                    ? 'border-[#2b4c7e] text-[#2b4c7e]'
                    : complete
                      ? 'border-transparent text-[#20242b]'
                      : 'border-transparent text-[#8a8f94]'
                }`}
              >
                <span className="mr-2 font-serif">{number}</span>{label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {error && <Alert tone="error" onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {historyOpen && (
          <SendHistoryPanel
            items={sendHistory}
            busy={historyBusy}
            error={historyError}
            onRefresh={() => setHistoryRefreshKey((key) => key + 1)}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {step === 1 && (
          <section>
            <SectionHeading
              eyebrow="STEP 1"
              title="まず、何を売っているかを読み取る。"
              copy="自社サイトのURLだけで開始できます。読み取った内容は検索前に編集できます。"
            />
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="site-url">自社サイトURL</label>
              <input
                id="site-url"
                type="url"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && analyzeSite()}
                placeholder="https://your-company.com"
                className="min-h-12 flex-1 rounded-md border border-[#cfd2cc] bg-white px-4 text-base outline-none focus:border-[#2b4c7e] focus:ring-3 focus:ring-[#2b4c7e]/10"
              />
              <PrimaryButton onClick={analyzeSite} disabled={!siteUrl.trim() || busy === 'analyze'}>
                <Search size={17} />
                {busy === 'analyze' ? 'サイトを読んでいます…' : 'サイトを分析'}
              </PrimaryButton>
            </div>

            {analysis && (
              <div className="mt-8 border-t border-[#d9dbd5] pt-7">
                <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                  <div>
                    <p className="text-xs font-black tracking-[0.14em] text-[#bc3f34]">読み取り結果</p>
                    <h2 className="mt-2 text-3xl font-black leading-tight">{analysis.company}</h2>
                    <p className="mt-3 text-sm leading-7 text-[#5f656c]">{analysis.offering}</p>
                    <div className="mt-5 border-l-3 border-[#2b4c7e] pl-4">
                      <p className="text-xs font-bold text-[#6b7076]">顧客にとっての価値</p>
                      <p className="mt-1 text-sm font-semibold leading-6">{analysis.valueProp}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d9dbd5] bg-[#fbfbf9] p-5">
                    <label className="text-xs font-black tracking-[0.1em] text-[#6b7076]" htmlFor="icp">
                      想定顧客（1行に1つ・編集可）
                    </label>
                    <textarea
                      id="icp"
                      value={analysis.idealCustomerProfile.join('\n')}
                      onChange={(event) => setAnalysis({
                        ...analysis,
                        idealCustomerProfile: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean),
                      })}
                      className="mt-3 min-h-36 w-full resize-y rounded-md border border-[#d9dbd5] bg-white p-3 text-sm leading-6 outline-none focus:border-[#2b4c7e]"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <PrimaryButton onClick={() => setStep(2)}>
                    この内容で相手を探す <ArrowRight size={17} />
                  </PrimaryButton>
                </div>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section>
            <SectionHeading
              eyebrow="STEP 2"
              title="根拠のある営業先だけを集める。"
              copy="公開ページの出典がないメールや、推測で作られたアドレスは送信候補から外します。"
            />
            {!analysis ? (
              <MissingStep onClick={() => setStep(1)} label="先に自社サイトを分析してください。" />
            ) : (
              <>
                <div className="mt-7 grid gap-4 rounded-lg border border-[#d9dbd5] bg-[#fbfbf9] p-5 md:grid-cols-2">
                  <Field label="ターゲット市場" required>
                    <input value={targetMarket} onChange={(event) => setTargetMarket(event.target.value)} placeholder="例: United States / Japan" className="field-input" />
                  </Field>
                  <Field label="営業目的" required>
                    <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例: 販売代理店との商談を取る" className="field-input" />
                  </Field>
                  <Field label="追加条件">
                    <input value={hint} onChange={(event) => setHint(event.target.value)} placeholder="例: 従業員20〜200名 / 過去顧客は除外" className="field-input" />
                  </Field>
                  <Field label="探す件数">
                    <select value={count} onChange={(event) => setCount(Number(event.target.value))} className="field-input">
                      {[5, 8, 10, 14].map((value) => <option key={value} value={value}>{value}社</option>)}
                    </select>
                  </Field>
                  <div className="md:col-span-2">
                    <PrimaryButton onClick={findLeads} disabled={busy === 'search'}>
                      <Search size={17} />
                      {busy === 'search' ? '検索・出典確認中…（最大2分）' : result ? '条件を変えて再検索' : '探索を開始'}
                    </PrimaryButton>
                  </div>
                </div>

                <details className="mt-4 rounded-lg border border-[#d9dbd5] bg-[#fbfbf9]">
                  <summary className="cursor-pointer px-5 py-4 text-sm font-black text-[#2b4c7e]">
                    公式サイトで確認済みの営業先を一括追加
                  </summary>
                  <div className="border-t border-[#d9dbd5] p-5">
                    <p className="text-xs font-semibold leading-6 text-[#6b7076]">
                      1行につき「会社名、公式URL、代表メール、メール掲載元URL、提案理由」をタブ区切りで入力します。3つの企業ドメインが一致する場合だけ追加できます。
                    </p>
                    <textarea
                      aria-label="確認済み営業先の一括入力"
                      value={verifiedLeadImport}
                      onChange={(event) => setVerifiedLeadImport(event.target.value)}
                      placeholder={'株式会社○○\thttps://example.co.jp\tinfo@example.co.jp\thttps://example.co.jp/company\t屋外広告事業を展開'}
                      className="field-input mt-3 min-h-36 resize-y font-mono text-xs leading-6"
                    />
                    <div className="mt-3 flex justify-end">
                      <SecondaryButton onClick={importVerifiedLeads} disabled={!verifiedLeadImport.trim()}>
                        <ShieldCheck size={16} /> ドメイン一致を確認して追加
                      </SecondaryButton>
                    </div>
                  </div>
                </details>

                {result && (
                  <div className="mt-8">
                    <div className="flex flex-col gap-3 border-b border-[#d9dbd5] pb-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-black tracking-[0.12em] text-[#2b4c7e]">営業先候補 {visibleProspects.length}社</p>
                        <h2 className="mt-1 text-2xl font-black">日本企業の営業先リスト</h2>
                        <p className="mt-2 text-sm font-semibold text-[#6b7076]">
                          {historyBusy
                            ? '送信履歴と照合中…'
                            : historyError
                              ? '送信履歴を確認できないため、文面作成と送信を停止しています。'
                              : `未送信・メール確認済み ${accepted.length}社 ／ 送信済み ${sentProspects.length}社 ／ 連絡先の確認が必要 ${needsContact.length}社`}
                        </p>
                      </div>
                      <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md border border-[#d9dbd5] bg-white px-3 py-2 text-sm font-bold hover:border-[#2b4c7e]">
                        <Clipboard size={15} /> CSV
                      </button>
                    </div>

                    {visibleProspects.length ? (
                      <div className="mt-5 grid gap-4">
                        {visibleProspects.map((item) => (
                          <LeadRow
                            key={item.lead.id}
                            item={item}
                            sentRecord={getSentHistory(item, sentHistoryByEmail)}
                            onExclude={() => setExcludedIds((ids) => [...ids, item.lead.id])}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-lg border border-[#d9dbd5] bg-white p-6">
                        <p className="font-bold">表示できる営業先候補がありませんでした。</p>
                        <p className="mt-2 text-sm leading-6 text-[#6b7076]">条件を変えてもう一度検索してください。</p>
                      </div>
                    )}

                    {manuallyExcluded.length > 0 && (
                      <details className="mt-5 rounded-lg border border-dashed border-[#c9ccc6] bg-[#f8f8f5]">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#5f656c]">
                          手動で除外した会社 {manuallyExcluded.length}社
                        </summary>
                        <div className="border-t border-[#d9dbd5] px-4 py-2">
                          {manuallyExcluded.map((item) => (
                            <div key={item.lead.id} className="flex flex-col gap-2 border-b border-[#e2e4df] py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-bold">{cleanOrganizationName(item.lead)}</p>
                                <p className="mt-1 text-xs text-[#6b7076]">手動で除外</p>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs font-bold">
                                <a href={item.lead.sourceUrl} target="_blank" rel="noreferrer" className="text-[#2b4c7e] underline">候補の出典</a>
                                <button type="button" onClick={() => setExcludedIds((ids) => ids.filter((id) => id !== item.lead.id))} className="text-[#bc3f34]">戻す</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {accepted.length > 0 && (
                      <div className="mt-6 flex flex-col items-end gap-2">
                        <p className="text-xs font-semibold text-[#6b7076]">公開メールを確認でき、かつ過去に送信していない会社だけを文面作成へ進めます。</p>
                        <PrimaryButton onClick={() => setStep(3)}>
                          {accepted.length}社の文面を書く <ArrowRight size={17} />
                        </PrimaryButton>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <SectionHeading
              eyebrow="STEP 3"
              title="一つのテンプレを、全員分の文面にする。"
              copy="共通テンプレの宛名と会社名を自動で差し替えます。会社ごとの編集や、AIによる個別文面の作成もできます。"
            />
            {!accepted.length ? (
              <MissingStep onClick={() => setStep(2)} label="先に出典付きの営業先を見つけてください。" />
            ) : (
              <>
                <div className="mt-7 rounded-lg border border-[#d9dbd5] bg-[#fbfbf9] p-5">
                  <div className="flex flex-col gap-2 border-b border-[#d9dbd5] pb-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black tracking-[0.12em] text-[#bc3f34]">差出人情報</p>
                      <h2 className="mt-1 text-xl font-black">自分の会社情報を設定</h2>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">Googleアカウントごとに保存</span>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="氏名" required><input className="field-input" value={profile.senderName} onChange={(event) => { setProfile({ ...profile, senderName: event.target.value }); setProfileSaved(false) }} placeholder="例: 山田太郎" /></Field>
                    <Field label="会社名" required><input className="field-input" value={profile.senderCompany} onChange={(event) => { setProfile({ ...profile, senderCompany: event.target.value }); setProfileSaved(false) }} placeholder="例: 株式会社○○" /></Field>
                    <Field label="事業者住所" required><input className="field-input" value={profile.senderAddress} onChange={(event) => { setProfile({ ...profile, senderAddress: event.target.value }); setProfileSaved(false) }} placeholder="例: 東京都渋谷区…" /></Field>
                    <Field label="連絡先" required><input className="field-input" value={profile.senderContact} onChange={(event) => { setProfile({ ...profile, senderContact: event.target.value }); setProfileSaved(false) }} placeholder={userEmail} /></Field>
                    <Field label="自社ウェブサイト"><input className="field-input" value={profile.websiteUrl} onChange={(event) => { setProfile({ ...profile, websiteUrl: event.target.value }); setProfileSaved(false) }} placeholder="https://example.com/" /></Field>
                    <Field label="営業資料URL"><input className="field-input" value={profile.salesDeckUrl} onChange={(event) => { setProfile({ ...profile, salesDeckUrl: event.target.value }); setProfileSaved(false) }} placeholder="Google Driveなどの共有URL" /></Field>
                    <Field label="提案内容の補足"><input className="field-input" value={profile.serviceNote} onChange={(event) => setProfile({ ...profile, serviceNote: event.target.value })} placeholder="例: グループ対応 / 導入支援 / 実績" /></Field>
                    <Field label="メール言語">
                      <select className="field-input" value={profile.language} onChange={(event) => setProfile({ ...profile, language: event.target.value as SenderProfile['language'] })}>
                        <option value="English">English</option>
                        <option value="Japanese">日本語</option>
                      </select>
                    </Field>
                  </div>
                  {userEmail.endsWith('@looq.icu') && (
                    <label className="mt-4 flex items-center gap-3 rounded-md border border-[#d9dbd5] bg-white p-4 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={profile.attachLooqDeck}
                        onChange={(event) => { setProfile({ ...profile, attachLooqDeck: event.target.checked }); setProfileSaved(false) }}
                      />
                      LOOQ_pitchdeck_JP.pdf を送信時に添付する
                    </label>
                  )}
                  <div className="mt-4 flex items-center justify-end gap-3">
                    {profileSaved && <span className="text-xs font-black text-emerald-700">保存済み</span>}
                    <SecondaryButton onClick={() => void saveProfile()} disabled={profileSaveBusy || !profileComplete}>
                      <ShieldCheck size={16} /> {profileSaveBusy ? '保存中…' : 'このアカウントに保存'}
                    </SecondaryButton>
                  </div>
                  <div className="mt-5 rounded-md border border-dashed border-[#b9bdb6] bg-white p-4">
                    <p className="text-xs font-black tracking-[0.08em] text-[#5f656c]">各メールの末尾へ自動挿入される内容</p>
                    <div className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#3f454b]">{buildFooter(profile)}</div>
                  </div>
                </div>

                <div className="mt-7 rounded-lg border-2 border-[#2b4c7e] bg-white p-5">
                  <div className="flex flex-col gap-2 border-b border-[#d9dbd5] pb-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black tracking-[0.12em] text-[#2b4c7e]">一括テンプレ</p>
                      <h2 className="mt-1 text-xl font-black">送信可能な{accepted.length}社すべてに反映</h2>
                    </div>
                    <p className="text-xs font-semibold text-[#6b7076]">送信済みのメールは上書きしません</p>
                  </div>
                  <div className="mt-5 grid gap-4">
                    <Field label="共通件名" required>
                      <input
                        className="field-input"
                        value={bulkTemplate.subject}
                        onChange={(event) => setBulkTemplate({ ...bulkTemplate, subject: event.target.value })}
                      />
                    </Field>
                    <Field label="共通本文" required>
                      <textarea
                        className="field-input min-h-64 resize-y leading-7"
                        value={bulkTemplate.body}
                        onChange={(event) => setBulkTemplate({ ...bulkTemplate, body: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="mt-4 rounded-md bg-[#f2f5f9] p-4 text-xs font-semibold leading-6 text-[#46566d]">
                    自動差し替え： <code>{'{{宛名}}'}</code> <code>{'{{会社名}}'}</code> <code>{'{{差出人名}}'}</code> <code>{'{{自社名}}'}</code> <code>{'{{提案内容}}'}</code>
                    <br />宛名が見つからない場合は「会社名 ご担当者様」にします。
                  </div>
                  {(profile.salesDeckUrl || (profile.attachLooqDeck && userEmail.endsWith('@looq.icu'))) && (
                    <div className="mt-3 flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
                      <span className="inline-flex items-center gap-2">
                        <Paperclip size={15} />
                        {profile.attachLooqDeck && userEmail.endsWith('@looq.icu')
                          ? 'LOOQ_pitchdeck_JP.pdfを全メールへ自動添付'
                          : '営業資料URLを全メールの本文へ自動挿入'}
                      </span>
                      <span className="flex flex-wrap gap-3">
                        {profile.salesDeckUrl && <a href={normalizeUrl(profile.salesDeckUrl)} target="_blank" rel="noreferrer" className="underline">営業資料を確認</a>}
                        {profile.attachLooqDeck && userEmail.endsWith('@looq.icu') && <a href="/sales-assets/LOOQ_pitchdeck_JP.pdf" target="_blank" rel="noreferrer" className="underline">添付PDFを確認</a>}
                      </span>
                    </div>
                  )}
                  <div className="mt-5 flex justify-end">
                    <PrimaryButton
                      onClick={applyBulkTemplate}
                      disabled={!bulkTemplate.subject.trim() || !bulkTemplate.body.trim() || !profile.senderName.trim() || !profile.senderCompany.trim()}
                    >
                      <FilePenLine size={17} /> {accepted.length}社分を一括作成
                    </PrimaryButton>
                  </div>
                </div>

                <div className="mt-7 flex flex-col gap-3 border-b border-[#d9dbd5] pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black text-[#2b4c7e]">{drafted.length} / {accepted.length}通 作成済み</p>
                    <h2 className="mt-1 text-2xl font-black">メール下書き</h2>
                  </div>
                  <PrimaryButton onClick={createAllDrafts} disabled={busy === 'draft-all' || !profile.senderName || !profile.senderCompany}>
                    <FilePenLine size={17} /> {busy === 'draft-all' ? '順番に作成中…' : '未作成をまとめて生成'}
                  </PrimaryButton>
                </div>

                <div className="mt-5 grid gap-4">
                  {accepted.map((item) => {
                    const draft = drafts[item.lead.id]
                    return (
                      <article key={item.lead.id} className="rounded-lg border border-[#d9dbd5] bg-white p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-lg font-black">{cleanOrganizationName(item.lead)}</h3>
                            <p className="mt-1 text-xs font-semibold text-[#6b7076]">{item.contact?.email}</p>
                          </div>
                          {!draft && (
                            <SecondaryButton onClick={() => createDraft(item)} disabled={draftingId === item.lead.id}>
                              <FilePenLine size={15} /> {draftingId === item.lead.id ? '作成中…' : 'この会社向けに生成'}
                            </SecondaryButton>
                          )}
                        </div>
                        {draft && (
                          <div className="mt-4">
                            <label className="text-xs font-black text-[#6b7076]">件名</label>
                            <input
                              value={draft.subject}
                              onChange={(event) => setDrafts({ ...drafts, [item.lead.id]: { ...draft, subject: event.target.value } })}
                              className="field-input mt-2 font-bold"
                            />
                            <label className="mt-4 block text-xs font-black text-[#6b7076]">本文</label>
                            <textarea
                              value={draft.body}
                              onChange={(event) => setDrafts({ ...drafts, [item.lead.id]: { ...draft, body: event.target.value } })}
                              className="field-input mt-2 min-h-52 resize-y leading-7"
                            />
                            <div className="mt-3 whitespace-pre-wrap border-t border-dashed border-[#d9dbd5] pt-3 text-xs leading-6 text-[#6b7076]">
                              {buildFooter(profileComplete ? profile : { ...profile, senderName: profile.senderName || '氏名未入力' })}
                            </div>
                            <div className="mt-4 flex justify-end">
                              <SecondaryButton onClick={() => createDraft(item)} disabled={draftingId === item.lead.id}>
                                書き直す
                              </SecondaryButton>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>

                {drafted.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <PrimaryButton onClick={() => setStep(4)} disabled={!profileComplete}>
                      {profileComplete ? `${drafted.length}通を確認して送る` : '必須の差出人情報を入力してください'} <ArrowRight size={17} />
                    </PrimaryButton>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {step === 4 && (
          <section>
            <SectionHeading
              eyebrow="STEP 4"
              title="内容を確認したら、送信はSayOKに任せる。"
              copy={`宛先・出典・件名・本文を確認して承認すると、${userEmail} のGmailからその場で送信します。`}
            />
            {!profileComplete || !drafted.length ? (
              <MissingStep onClick={() => setStep(3)} label="先に差出人情報とメール下書きを完成させてください。" />
            ) : (
              <div className="mt-7 grid gap-4">
                <div className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  gmailConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}>
                  <div>
                    <p className="text-sm font-black">送信元: {userEmail}</p>
                    <p className="mt-1 text-xs font-bold">
                      {gmailConnected
                        ? 'Gmail送信権限を確認済みです。承認するまで送信しません。'
                        : googleAuthEnabled
                          ? '実メール送信にはGmail権限の再接続が必要です。'
                          : 'Gmail送信連携は設定中です。設定完了までは送信ボタンを利用できません。'}
                    </p>
                  </div>
                  {!gmailConnected && googleAuthEnabled && (
                    <button type="button" onClick={onReconnectGoogle} className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-900 px-4 py-3 text-sm font-black text-white">
                      <RefreshCw size={16} /> Gmailを再接続
                    </button>
                  )}
                </div>
                {readyToSend.length > 0 && (
                  <div className="rounded-lg border-2 border-[#2b4c7e] bg-[#eef2f7] p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black tracking-[0.12em] text-[#2b4c7e]">一括送信</p>
                        <h2 className="mt-1 text-xl font-black">未送信の{readyToSend.length}通をまとめて送る</h2>
                        <p className="mt-2 text-xs font-semibold text-[#5f656c]">各メールは別々の宛先へ送信されます。CC・BCCでの一斉送信ではありません。</p>
                      </div>
                      {confirmId !== BULK_CONFIRM_ID && (
                        <PrimaryButton onClick={() => setConfirmId(BULK_CONFIRM_ID)} disabled={!gmailConnected || busy === 'send-all'}>
                          <Mail size={17} /> 全{readyToSend.length}通を最終確認
                        </PrimaryButton>
                      )}
                    </div>
                    {confirmId === BULK_CONFIRM_ID && (
                      <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#bc3f34] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black">この承認で{readyToSend.length}通の実メールを順番に送信します。</p>
                          <p className="mt-1 text-xs font-bold text-[#6b4a46]">宛先・件名・本文を下の一覧で確認してください。送信後は取り消せません。</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <SecondaryButton onClick={() => setConfirmId('')}>戻る</SecondaryButton>
                          <PrimaryButton onClick={() => void sendAllReadyEmails()} disabled={busy === 'send-all'}>
                            <Send size={16} /> {busy === 'send-all' ? '順番に送信中…' : `${readyToSend.length}通を承認して送信`}
                          </PrimaryButton>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {drafted.map((item) => {
                  const draft = drafts[item.lead.id]
                  const contact = item.contact
                  const fullEmail = `${prepareSalesBody(draft.body, profile)}\n\n${buildFooter(profile)}`
                  return (
                    <article key={item.lead.id} className="rounded-lg border border-[#d9dbd5] bg-white p-5">
                      <div className="flex flex-col gap-3 border-b border-[#e2e4df] pb-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill state={draft.state} />
                            <span className="text-xs font-bold text-[#6b7076]">{item.validation.flags.join(' · ')}</span>
                          </div>
                          <h2 className="mt-2 text-xl font-black">{cleanOrganizationName(item.lead)}</h2>
                          <p className="mt-1 break-all text-sm font-semibold text-[#2b4c7e]">{contact?.email}</p>
                        </div>
                        <a href={contact?.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#2b4c7e] underline">
                          メールの出典 <ExternalLink size={13} />
                        </a>
                      </div>
                      <div className="mt-4">
                        <p className="font-black">{draft.subject}</p>
                        {profile.attachLooqDeck && userEmail.endsWith('@looq.icu') && (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#eef2f7] px-3 py-1.5 text-xs font-black text-[#2b4c7e]">
                            <Paperclip size={14} /> LOOQ_pitchdeck_JP.pdf
                          </div>
                        )}
                        {profile.salesDeckUrl && (
                          <a href={normalizeUrl(profile.salesDeckUrl)} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-xs font-bold text-[#2b4c7e] underline">
                            営業資料を確認 <ExternalLink size={13} />
                          </a>
                        )}
                        <div className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-[#f7f7f4] p-4 text-sm leading-7">{fullEmail}</div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        <SecondaryButton onClick={() => copyText(item.lead.id, fullEmail)}>
                          <Clipboard size={15} /> {copied === item.lead.id ? 'コピー済み' : '本文をコピー'}
                        </SecondaryButton>
                        {draft.state !== 'sent' && draft.state !== 'sending' && confirmId !== item.lead.id && confirmId !== BULK_CONFIRM_ID && (
                          <PrimaryButton onClick={() => setConfirmId(item.lead.id)} disabled={!gmailConnected || busy === 'send-all'}>
                            <Mail size={17} /> 送信内容を最終確認
                          </PrimaryButton>
                        )}
                        {draft.state === 'sending' && (
                          <PrimaryButton onClick={() => undefined} disabled>
                            <Send size={16} /> 送信しています…
                          </PrimaryButton>
                        )}
                        {confirmId === item.lead.id && (
                          <div className="flex w-full flex-col gap-3 rounded-md border border-[#bc3f34] bg-[#bc3f34]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-black">この承認で実メールを送信します。</p>
                              <p className="mt-1 text-xs font-bold text-[#6b4a46]">送信後は取り消せません。宛先・出典・本文をもう一度確認してください。</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <SecondaryButton onClick={() => setConfirmId('')}>戻る</SecondaryButton>
                              <PrimaryButton onClick={() => void sendEmail(item)}><Send size={16} /> 承認して送信</PrimaryButton>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
            <p className="mt-6 text-xs leading-6 text-[#6b7076]">
              公開された事業者向け連絡先のみを対象にします。「営業お断り」の記載、配信停止、同一宛先への送信履歴、1日上限はサーバーでも確認します。最終的な送信判断と適法性の確認は送信者が行ってください。
            </p>
          </section>
        )}
      </main>
    </div>
  )
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-black tracking-[0.18em] text-[#bc3f34]">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 text-base font-medium leading-7 text-[#5f656c] sm:text-lg">{copy}</p>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black tracking-[0.08em] text-[#5f656c]">
        {label}{required && <span className="ml-1 text-[#bc3f34]">必須</span>}
      </span>
      {children}
    </label>
  )
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#1e3a63] bg-[#2b4c7e] px-5 text-sm font-black text-white hover:bg-[#1e3a63] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cfd2cc] bg-white px-4 text-sm font-black text-[#30353b] hover:border-[#2b4c7e] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  )
}

function Alert({ children, tone, onClose }: { children: React.ReactNode; tone: 'error' | 'success'; onClose: () => void }) {
  return (
    <div className={`mb-6 flex items-start justify-between gap-4 rounded-md border p-4 text-sm font-bold ${
      tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }`}>
      <span>{children}</span>
      <button type="button" onClick={onClose} aria-label="閉じる"><X size={17} /></button>
    </div>
  )
}

function MissingStep({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mt-7 rounded-lg border border-[#d9dbd5] bg-white p-6">
      <p className="font-bold">{label}</p>
      <button type="button" onClick={onClick} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#2b4c7e]">
        <ArrowLeft size={16} /> 前の工程へ戻る
      </button>
    </div>
  )
}

function SendHistoryPanel({
  items,
  busy,
  error,
  onRefresh,
  onClose,
}: {
  items: SendHistoryItem[]
  busy: boolean
  error: string
  onRefresh: () => void
  onClose: () => void
}) {
  return (
    <section className="mb-8 rounded-lg border-2 border-[#2b4c7e] bg-white p-5" aria-label="営業メール送信履歴">
      <div className="flex flex-col gap-3 border-b border-[#d9dbd5] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.14em] text-[#2b4c7e]">再送防止リスト</p>
          <h2 className="mt-1 text-2xl font-black">SayOKから送信済みの営業先</h2>
          <p className="mt-2 text-xs font-semibold text-[#6b7076]">このメールアドレスは候補検索と送信時の両方で自動的に除外されます。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-[#d9dbd5] px-3 py-2 text-xs font-bold text-[#4f555c] hover:border-[#2b4c7e] disabled:opacity-50">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 更新
          </button>
          <button type="button" onClick={onClose} aria-label="送信履歴を閉じる" className="rounded-md border border-[#d9dbd5] p-2 text-[#4f555c] hover:border-[#bc3f34] hover:text-[#bc3f34]">
            <X size={16} />
          </button>
        </div>
      </div>

      {busy ? (
        <p className="py-8 text-center text-sm font-bold text-[#6b7076]">送信履歴を読み込んでいます…</p>
      ) : error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm font-bold text-[#6b7076]">SayOKから送信した営業メールはまだありません。</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-md border border-[#d9dbd5] bg-[#fbfbf9] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">送信済み・再送対象外</span>
                    <time className="text-xs font-bold text-[#6b7076]" dateTime={item.sentAt}>{formatTokyoDate(item.sentAt)}</time>
                  </div>
                  <h3 className="mt-2 text-lg font-black">{item.organization}</h3>
                  <p className="mt-1 break-all font-mono text-xs font-bold text-[#2b4c7e]">{item.toEmail}</p>
                  <p className="mt-3 text-sm font-bold">{item.subject || '件名なし'}</p>
                </div>
                {item.sourceUrl && (
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#2b4c7e] underline">
                    連絡先の出典 <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function LeadRow({ item, sentRecord, onExclude }: { item: LeadView; sentRecord?: SendHistoryItem; onExclude: () => void }) {
  const sendable = item.validation.ok && !sentRecord

  return (
    <article className="grid gap-4 rounded-lg border border-[#d9dbd5] bg-white p-5 md:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${sentRecord ? 'border-emerald-600 text-emerald-700' : sendable ? 'border-[#2b4c7e] text-[#2b4c7e]' : 'border-[#b98027] text-[#9a681d]'}`}>
        {sentRecord ? <CheckCircle2 size={20} /> : sendable ? <ShieldCheck size={20} /> : <Mail size={20} />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-black">{cleanOrganizationName(item.lead)}</h3>
          <span className="rounded-full bg-[#eef2f7] px-2 py-1 text-xs font-bold text-[#2b4c7e]">
            {Math.round(item.lead.confidence * 100)}% fit
          </span>
          <span className={`rounded-full px-2 py-1 text-xs font-black ${sentRecord ? 'bg-emerald-100 text-emerald-900' : sendable ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {sentRecord ? '送信済み・再送対象外' : sendable ? 'メール確認済み' : '連絡先未確認'}
          </span>
        </div>
        <a href={item.lead.organizationWebsite} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs font-bold text-[#2b4c7e] underline">
          {displayHost(item.lead.organizationWebsite)} <ExternalLink size={12} />
        </a>
        <p className="mt-3 text-sm leading-6">{formatReasonForFit(item.lead)}</p>
        <p className="mt-2 text-xs leading-5 text-[#6b7076]">
          根拠: <a href={item.lead.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-[#2b4c7e] underline">公開ページを確認</a>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sentRecord ? (
            <>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-xs font-bold text-emerald-900">{item.contact?.email}</span>
              <span className="text-xs font-bold text-emerald-800">{formatTokyoDate(sentRecord.sentAt)} に送信済み</span>
            </>
          ) : sendable ? (
            <>
              <span className="rounded-md border border-[#d9dbd5] bg-[#fbfbf9] px-3 py-2 font-mono text-xs font-bold">{item.contact?.email}</span>
              {item.validation.flags.map((flag) => <span key={flag} className="rounded-full border border-[#d9dbd5] px-2 py-1 text-[11px] font-bold text-[#5f656c]">{flag}</span>)}
              {item.contact?.sourceUrl && <a href={item.contact.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#2b4c7e] underline">メール出典</a>}
            </>
          ) : (
            <>
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">公開メールは未確認</span>
              <a href={item.lead.organizationWebsite} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#2b4c7e] underline">公式サイトで問い合わせ先を確認</a>
            </>
          )}
        </div>
      </div>
      <button type="button" onClick={onExclude} className="self-start rounded-md border border-[#d9dbd5] px-3 py-2 text-xs font-bold text-[#6b7076] hover:border-[#bc3f34] hover:text-[#bc3f34]">
        除外
      </button>
    </article>
  )
}

function StatusPill({ state }: { state: Draft['state'] }) {
  const styles = {
    ready: 'bg-[#fff3e8] text-[#a54813]',
    sending: 'bg-[#eef2f7] text-[#2b4c7e]',
    sent: 'bg-emerald-50 text-emerald-800',
  }
  const labels = { ready: '送信準備完了', sending: '送信中', sent: '送信済み' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${styles[state]}`}>
      {state === 'sent' && <CheckCircle2 size={13} />}{labels[state]}
    </span>
  )
}

function getSentHistory(item: LeadView, historyByEmail: Map<string, SendHistoryItem>) {
  const email = item.contact?.email?.trim().toLowerCase()
  return email ? historyByEmail.get(email) : undefined
}

function formatTokyoDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

function validateContact(contact: Contact | null, lead: Lead, targetMarket: string): Validation {
  if (!contact?.email) return { ok: false, flags: ['メール未発見'] }
  const email = contact.email.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return { ok: false, flags: ['形式不正'] }
  const [local, domain] = email.split('@')
  if (
    /^(x{3,}|example|sample|test|yourname|youremail|your-email|name|email|user|usuario|seu|seunome|seuemail)$/i.test(local)
    || /(^|\.)(x{2,}|example|sample|test|localhost)(\.|$)/i.test(domain)
    || ['domain.com', 'email.com', 'example.com', 'example.org', 'example.net', 'sample.com', 'test.com', 'mailinator.com'].includes(domain)
  ) {
    return { ok: false, flags: ['ダミーアドレス'] }
  }
  if (['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster'].includes(local)) {
    return { ok: false, flags: ['送信不可アドレス'] }
  }
  if (contact.emailStatus === 'guessed' || contact.emailStatus === 'not_found') return { ok: false, flags: ['推測メールのため不採用'] }
  if (!isUsableSource(contact.sourceUrl)) return { ok: false, flags: ['公開出典なし'] }
  if (isObviousMarketMismatch(lead, targetMarket)) return { ok: false, flags: ['対象市場外の可能性'] }

  const siteDomain = registeredDomain(safeHost(lead.organizationWebsite))
  const emailDomain = registeredDomain(domain)
  const sourceDomain = registeredDomain(safeHost(contact.sourceUrl))
  if (!siteDomain || !emailDomain || !sourceDomain || siteDomain !== emailDomain || sourceDomain !== emailDomain) {
    return { ok: false, flags: ['企業ドメイン不一致'] }
  }
  if (['support', 'privacy', 'recruit', 'recruiting', 'jobs', 'career'].includes(local)) {
    return { ok: false, flags: ['営業窓口ではないため除外'] }
  }

  const flags = [contact.emailStatus === 'verified' ? '検証済み' : '公開ページで発見', '企業ドメイン一致']
  if (['info', 'contact', 'sales', 'hello', 'inquiry'].includes(local)) flags.push('代表窓口')
  return { ok: true, flags }
}

function isValidEmail(value: string) {
  return /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)
}

function isPublicUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && url.hostname !== 'localhost'
  } catch {
    return false
  }
}

function contactScore(contact: Contact) {
  let score = contact.confidence || 0
  if (contact.emailStatus === 'verified') score += 2
  if (isUsableSource(contact.sourceUrl)) score += 1
  if (contact.name) score += 0.3
  if (contact.title) score += 0.2
  return score
}

function isUsableSource(value: string) {
  if (!value) return false
  try {
    const host = new URL(value).hostname.replace(/^www\./, '')
    return !['apollo.io'].includes(host) && !(host === 'hunter.io' && value.includes('/search/'))
  } catch {
    return false
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function registeredDomain(value: string) {
  const parts = value.toLowerCase().split('.').filter(Boolean)
  const suffix = parts.slice(-2).join('.')
  if (['co.jp', 'ac.jp', 'go.jp', 'ne.jp', 'or.jp', 'co.uk', 'org.uk', 'ac.uk', 'com.au', 'edu.au'].includes(suffix)) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

function isObviousMarketMismatch(lead: Lead, targetMarket: string) {
  const market = targetMarket.trim().toLowerCase()
  const host = safeHost(lead.organizationWebsite)
  if (['japan', 'jp', '日本', '日本企業', 'japanese market'].includes(market)) {
    if (host.endsWith('.jp')) return false
    const suffix = host.split('.').pop() || ''
    if (suffix.length === 2 && !['ai', 'co', 'fm', 'io', 'me', 'tv'].includes(suffix)) return true
    const evidence = `${lead.organizationName} ${lead.reasonForFit} ${lead.country} ${host}`
    return !/[ぁ-んァ-ヶ一-龠々]|\b(?:japan|tokyo|osaka|kyoto|yokohama|nagoya|fukuoka)\b/i.test(evidence)
  }
  if (['usa', 'us', 'united states', 'america', 'u.s.', 'u.s.a.'].includes(market) && host.endsWith('.jp')) return true
  if (['uk', 'united kingdom', 'britain'].includes(market) && host.endsWith('.jp')) return true
  return false
}

function cleanOrganizationName(lead: Lead) {
  const raw = lead.organizationName
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+https?\s*$/i, ' ')
    .replace(/\s+[›»]\s+.*$/u, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const companyParts = raw
    .split(/[：:｜|]/)
    .map((part) => part.trim())
    .filter((part) => /株式会社|合同会社|有限会社|一般社団法人|公益社団法人/.test(part))
    .sort((a, b) => a.length - b.length)
  if (companyParts[0]) return companyParts[0]
  if (!raw || raw.length > 100) {
    const host = safeHost(lead.organizationWebsite)
    return host ? host.split('.')[0].replaceAll('-', ' ') : 'Organization'
  }
  return raw
}

function personalizeTemplate(
  template: string,
  item: LeadView,
  profile: SenderProfile,
  analysis: SiteAnalysis | null,
) {
  const company = cleanOrganizationName(item.lead)
  const contactName = item.contact?.name?.trim() || ''
  const useJapaneseHonorific = /[ぁ-んァ-ヶ一-龠々]/.test(template)
  const hasNamedContact = Boolean(
    contactName
    && contactName.length <= 80
    && !/^(public contact|unknown contact|general contact|relevant business contact|contact|info|inquiry|sales|support|team|担当者|ご担当者|窓口)$/i.test(contactName),
  )
  const recipient = hasNamedContact
    ? useJapaneseHonorific
      ? contactName.endsWith('様') ? contactName : `${contactName} 様`
      : contactName
    : useJapaneseHonorific
      ? `${company} ご担当者様`
      : `${company} team`

  return template
    .replaceAll('{{宛名}}', recipient)
    .replaceAll('{{会社名}}', company)
    .replaceAll('{{差出人名}}', profile.senderName.trim())
    .replaceAll('{{自社名}}', profile.senderCompany.trim())
    .replaceAll('{{提案内容}}', profile.serviceNote.trim() || analysis?.offering?.trim() || '弊社サービス')
}

function formatReasonForFit(lead: Lead) {
  const reason = lead.reasonForFit.trim()
  if (/^Matched a real web result for:/i.test(reason)) {
    const host = safeHost(lead.organizationWebsite)
    return `${lead.country}の営業候補として、${host || cleanOrganizationName(lead)}の公式サイトと公開連絡先を確認しました。`
  }
  return reason
}

function displayHost(value: string) {
  return safeHost(value) || value
}

function prepareSalesBody(value: string, profile: SenderProfile) {
  const body = value.trim()
  const japanese = /[ぁ-んァ-ヶ一-龠々]/.test(body)
  const websiteUrl = profile.websiteUrl.trim() ? normalizeUrl(profile.websiteUrl) : ''
  const salesDeckUrl = profile.salesDeckUrl.trim() ? normalizeUrl(profile.salesDeckUrl) : ''
  const additions = [
    websiteUrl && !body.includes(websiteUrl)
      ? japanese
        ? `${profile.senderCompany} ウェブサイト：\n${websiteUrl}`
        : `${profile.senderCompany} website:\n${websiteUrl}`
      : '',
    salesDeckUrl && !body.includes(salesDeckUrl)
      ? japanese
        ? `サービス資料：\n${salesDeckUrl}`
        : `Service deck:\n${salesDeckUrl}`
      : '',
    profile.attachLooqDeck && !body.includes('LOOQ_pitchdeck_JP.pdf')
      ? japanese
        ? 'サービス資料「LOOQ_pitchdeck_JP.pdf」も添付しておりますので、あわせてご覧ください。'
        : 'I have also attached our service deck, LOOQ_pitchdeck_JP.pdf, for reference.'
      : '',
  ].filter(Boolean)
  return additions.length ? `${body}\n\n${additions.join('\n\n')}` : body
}

function profileForUser(email: string, userName: string, initialProfile?: Partial<SenderProfile>): SenderProfile {
  const normalizedEmail = email.trim().toLowerCase()
  const looqUser = normalizedEmail.endsWith('@looq.icu')
  const dogeUser = normalizedEmail === 'dogejapan@ownthedoge.com'
  const yudai = normalizedEmail === 'yudai@looq.icu'
  const defaults: SenderProfile = {
    ...emptyProfile,
    senderName: userName || (yudai ? '石田雄大' : ''),
    senderCompany: looqUser ? 'LOOQ Japan' : dogeUser ? 'Own The Doge' : '',
    senderAddress: yudai ? '〒150-0002 東京都渋谷区渋谷2-19-19 ワコー宮益坂ビル5階' : '',
    senderContact: normalizedEmail,
    websiteUrl: looqUser ? 'https://www.looq.jp/' : dogeUser ? 'https://ownthedoge.com/' : '',
    salesDeckUrl: looqUser ? SALES_DECK_DRIVE_URL : dogeUser ? DOGEDAY_DECK_DRIVE_URL : '',
    attachLooqDeck: looqUser,
    serviceNote: dogeUser
      ? 'DOGE DAY 2026 sponsorships and collaborations including brand activations, media placement, community engagement, VIP access, speaking opportunities, merchandise, and digital-collectible collaborations.'
      : '',
    language: dogeUser ? 'English' : 'Japanese',
  }
  const merged = {
    ...defaults,
    ...initialProfile,
    attachLooqDeck: looqUser && initialProfile?.attachLooqDeck !== false,
  }
  if (!merged.senderName.trim()) merged.senderName = defaults.senderName
  if (!merged.senderCompany.trim()) merged.senderCompany = defaults.senderCompany
  if (!merged.senderContact.trim()) merged.senderContact = defaults.senderContact
  if (!merged.websiteUrl.trim()) merged.websiteUrl = defaults.websiteUrl
  if (!merged.salesDeckUrl.trim()) merged.salesDeckUrl = defaults.salesDeckUrl
  if (!merged.serviceNote.trim()) merged.serviceNote = defaults.serviceNote
  return merged
}

function bulkTemplateForUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (normalizedEmail.endsWith('@looq.icu')) return looqBulkTemplate
  if (normalizedEmail === 'dogejapan@ownthedoge.com') return dogeDayBulkTemplate
  return genericBulkTemplate
}

function buildFooter(profile: SenderProfile) {
  if (profile.language === 'Japanese') {
    return [
      '――――――――――――――――',
      `${profile.senderCompany} ${profile.senderName}`.trim(),
      profile.senderAddress,
      `連絡先: ${profile.senderContact}`,
    ].filter(Boolean).join('\n')
  }

  return [
    '――――――――――――――――',
    `${profile.senderCompany} ${profile.senderName}`.trim(),
    profile.senderAddress,
    `Contact: ${profile.senderContact}`,
  ].filter(Boolean).join('\n')
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}
