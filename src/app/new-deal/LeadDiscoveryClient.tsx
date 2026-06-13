'use client'

import { useEffect, useMemo, useState } from 'react'
import type { User as AuthUser } from '@supabase/supabase-js'
import type { ApiSetupError, Contact, Lead, LeadDiscoveryResult, OutreachMessage } from '@/lib/lead-types'
import { checkAuthHealth, getAuthCallbackUrl, supabase } from '@/lib/supabase'

const initialForm = {
  websiteUrl: '',
  targetMarket: '',
  goal: '',
}

const emptySenderProfile = {
  name: '',
  template: '',
}

type SavedLeadRun = {
  id: string
  createdAt: string
  websiteUrl: string
  targetMarket: string
  goal: string
  leadCount: number
  outreachCount: number
  result: LeadDiscoveryResult
}

type LeadUser = Pick<AuthUser, 'id' | 'email'>

export default function LeadDiscoveryClient() {
  const [form, setForm] = useState(initialForm)
  const [user, setUser] = useState<LeadUser | null>(null)
  const [senderProfile, setSenderProfile] = useState(emptySenderProfile)
  const [savedRuns, setSavedRuns] = useState<SavedLeadRun[]>([])
  const [result, setResult] = useState<LeadDiscoveryResult | null>(null)
  const [setupError, setSetupError] = useState<ApiSetupError | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [gateUnlocked, setGateUnlocked] = useState(false)
  const [captureEmail, setCaptureEmail] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [isCapturingEmail, setIsCapturingEmail] = useState(false)
  const [copied, setCopied] = useState('')

  const ownerKey = user?.id || 'guest'

  useEffect(() => {
    const existingSession = localStorage.getItem('sayok:leadSessionId') || crypto.randomUUID()
    localStorage.setItem('sayok:leadSessionId', existingSession)
    setSessionId(existingSession)
    setGateUnlocked(localStorage.getItem('sayok:leadGateUnlocked') === 'true')
    try {
      const lastResult = localStorage.getItem('sayok:lastLeadDiscovery')
      if (lastResult) setResult(JSON.parse(lastResult))
    } catch {
      localStorage.removeItem('sayok:lastLeadDiscovery')
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(`sayok:leadProfile:${ownerKey}`)
      const savedHistory = localStorage.getItem(`sayok:leadHistory:${ownerKey}`)
      if (user && savedProfile) setSenderProfile(JSON.parse(savedProfile))
      else setSenderProfile(emptySenderProfile)
      if (savedHistory) setSavedRuns(JSON.parse(savedHistory))
      else setSavedRuns([])
    } catch {
      setSavedRuns([])
    }
  }, [ownerKey])

  const contactsByLead = useMemo(() => {
    const map = new Map<string, Contact[]>()
    for (const contact of result?.contacts || []) {
      map.set(contact.leadId, [...(map.get(contact.leadId) || []), contact])
    }
    return map
  }, [result])

  const outreachByContact = useMemo(() => {
    const map = new Map<string, OutreachMessage>()
    for (const message of result?.outreach || []) map.set(message.contactId, message)
    return map
  }, [result])

  const outreachByLead = useMemo(() => {
    const map = new Map<string, OutreachMessage>()
    for (const message of result?.outreach || []) map.set(message.leadId, message)
    return map
  }, [result])

  async function runDiscovery() {
    if (!form.websiteUrl.trim() || !form.targetMarket.trim() || !form.goal.trim()) {
      setError('Website URL, target market, and business goal are required.')
      return
    }

    setIsLoading(true)
    setError('')
    setSetupError(null)
    setResult(null)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
      }
      const response = await fetch('/api/lead-discovery', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...form,
          maxLeads: 14,
          sessionId,
          senderProfile: user ? senderProfile.name : '',
          outreachTemplate: user ? senderProfile.template : '',
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 503 && data?.missing) setSetupError(data)
        else setError(data?.error || 'Lead discovery failed.')
        return
      }

      setResult(data as LeadDiscoveryResult)
      localStorage.setItem('sayok:lastLeadDiscovery', JSON.stringify(data))
      saveRun(data as LeadDiscoveryResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lead discovery failed.')
    } finally {
      setIsLoading(false)
    }
  }

  function exportCsv() {
    if (!result) return
    const rows = [
      ['Organization', 'Website', 'Category', 'Country', 'Reason', 'Source', 'Lead confidence', 'Status', 'Contact', 'Title', 'Email', 'Email status', 'LinkedIn', 'Outreach subject'],
      ...result.leads.flatMap((lead) => {
        const contacts = contactsByLead.get(lead.id) || []
        if (contacts.length === 0) {
          const outreach = outreachByLead.get(lead.id)
          return [[lead.organizationName, lead.organizationWebsite, lead.category, lead.country, lead.reasonForFit, lead.sourceUrl, lead.confidence, lead.status, '', '', '', '', '', outreach?.subject || '']]
        }
        return contacts.map((contact) => {
          const outreach = outreachByContact.get(contact.id)
          return [
            lead.organizationName,
            lead.organizationWebsite,
            lead.category,
            lead.country,
            lead.reasonForFit,
            lead.sourceUrl,
            lead.confidence,
            lead.status,
            contact.name,
            contact.title,
            contact.email,
            contact.emailStatus,
            contact.linkedinUrl,
            outreach?.subject || '',
          ]
        })
      }),
    ]

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sayok-leads-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1600)
  }

  async function captureEmailAndUnlock() {
    if (!captureEmail.trim()) {
      setError('Enter an email address to view the results.')
      return
    }
    setIsCapturingEmail(true)
    setError('')
    try {
      const response = await fetch('/api/lead-discovery/capture-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: captureEmail, marketingConsent }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data?.error || 'Could not save email.')
        return
      }
      localStorage.setItem('sayok:leadGateUnlocked', 'true')
      setGateUnlocked(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save email.')
    } finally {
      setIsCapturingEmail(false)
    }
  }

  async function handleLogin() {
    if (!supabase) {
      setError('Google login is not connected yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel, then enable Google OAuth in Supabase.')
      return
    }
    const authIsReachable = await checkAuthHealth()
    if (!authIsReachable) {
      setError('Login is not connected. Supabase project URL or anon key is missing, invalid, or the project is paused.')
      return
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthCallbackUrl('/new-deal') },
    })
    if (error) setError(error.message)
  }

  async function handleLogout() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  function saveProfile() {
    localStorage.setItem(`sayok:leadProfile:${ownerKey}`, JSON.stringify(senderProfile))
    setCopied('profile')
    window.setTimeout(() => setCopied(''), 1600)
  }

  function saveRun(nextResult: LeadDiscoveryResult) {
    const nextRun: SavedLeadRun = {
      id: nextResult.id,
      createdAt: nextResult.createdAt,
      websiteUrl: nextResult.input.websiteUrl,
      targetMarket: nextResult.input.targetMarket,
      goal: nextResult.input.goal,
      leadCount: nextResult.leads.length,
      outreachCount: nextResult.outreach.length,
      result: nextResult,
    }
    const nextRuns = [nextRun, ...savedRuns.filter((run) => run.id !== nextRun.id)].slice(0, 20)
    setSavedRuns(nextRuns)
    localStorage.setItem(`sayok:leadHistory:${ownerKey}`, JSON.stringify(nextRuns))
  }

  function loadSavedRun(run: SavedLeadRun) {
    setForm({
      websiteUrl: run.websiteUrl,
      targetMarket: run.targetMarket,
      goal: run.goal,
    })
    setResult(run.result)
    setError('')
    setSetupError(null)
  }

  const canViewResults = Boolean(user || gateUnlocked)
  const verifiedEmailCount = result?.contacts.filter((contact) => contact.email && contact.emailStatus === 'verified').length || 0

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-orange-100 bg-white/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="text-xl font-black text-orange-500">SayOK</a>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-700 sm:inline-flex">Real lead workflow</span>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="max-w-[160px] truncate text-sm font-semibold text-gray-600">{user.email}</span>
                <button onClick={handleLogout} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">Log out</button>
              </div>
            ) : (
              <button onClick={handleLogin} className="rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800">Continue with Google</button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">No fake leads</p>
            <h1 className="mb-3 text-4xl font-black leading-tight text-gray-950">Find real people to contact.</h1>
            <p className="text-base leading-7 text-gray-600">Paste a website and goal. SayOK searches the web, finds public organizations and emails, then drafts outreach only when real contacts are found.</p>
          </div>

          <form
            className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault()
              void runDiscovery()
            }}
          >
            <label className="block text-sm font-bold text-gray-800">Website URL</label>
            <input
              value={form.websiteUrl}
              onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })}
              placeholder="https://company.com"
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />

            <label className="mt-4 block text-sm font-bold text-gray-800">Target market</label>
            <input
              value={form.targetMarket}
              onChange={(event) => setForm({ ...form, targetMarket: event.target.value })}
              placeholder="Japan, Southeast Asia, Tokyo..."
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />

            <label className="mt-4 block text-sm font-bold text-gray-800">Business goal</label>
            <textarea
              value={form.goal}
              onChange={(event) => setForm({ ...form, goal: event.target.value })}
              placeholder="Find distributors, book meetings with AI startups, get 50 customers..."
              className="mt-2 h-28 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />

            <button
              disabled={isLoading}
              className="mt-5 w-full rounded-xl bg-orange-500 px-5 py-4 text-base font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
            >
              {isLoading ? 'Finding real leads...' : 'Find leads and emails'}
            </button>
          </form>

          {user ? (
            <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">Sending profile</p>
                  <h2 className="mt-1 text-lg font-black text-gray-950">Customize your outreach style</h2>
                </div>
                <button type="button" onClick={saveProfile} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-50">
                  {copied === 'profile' ? 'Saved' : 'Save'}
                </button>
              </div>
              <label className="mt-4 block text-sm font-bold text-gray-800">Profile name</label>
              <input
                value={senderProfile.name}
                onChange={(event) => setSenderProfile({ ...senderProfile, name: event.target.value })}
                placeholder="My company / offer"
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              />
              <label className="mt-4 block text-sm font-bold text-gray-800">Default email template</label>
              <textarea
                value={senderProfile.template}
                onChange={(event) => setSenderProfile({ ...senderProfile, template: event.target.value })}
                placeholder="Paste the outreach style you want SayOK to reuse. Use {{organization}} where the target name should appear."
                className="mt-2 h-56 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              />
              <p className="mt-2 text-xs font-semibold text-gray-500">This is private to your workspace. Use {'{{organization}}'} where SayOK should insert the target name.</p>
            </section>
          ) : (
            <section className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-500">Sending profile</p>
              <h2 className="mt-1 text-lg font-black text-gray-950">Log in to customize outreach</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">Guest searches use a generic outreach style. Your company templates and history appear after login.</p>
              <button type="button" onClick={handleLogin} className="mt-4 rounded-xl bg-gray-950 px-4 py-3 text-sm font-black text-white hover:bg-gray-800">Log in</button>
            </section>
          )}

          <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">History</p>
                <h2 className="mt-1 text-lg font-black text-gray-950">Your recent reach-outs</h2>
              </div>
              {!user && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">guest</span>}
            </div>
            {savedRuns.length === 0 ? (
              <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm font-semibold text-gray-500">No saved lead runs yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {savedRuns.slice(0, 5).map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => loadSavedRun(run)}
                    className="w-full rounded-xl border border-gray-200 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/30"
                  >
                    <p className="line-clamp-1 text-sm font-black text-gray-900">{run.websiteUrl}</p>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-gray-500">{run.goal}</p>
                    <p className="mt-2 text-xs font-bold text-orange-700">{run.leadCount} leads · {run.outreachCount} messages</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0">
          <PipelineStatus isLoading={isLoading} result={result} />

          {setupError && <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 font-semibold text-orange-800">{setupError.error}</div>}

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-semibold text-red-700">{error}</div>}

          {!result && !setupError && !error && !isLoading && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <h2 className="text-2xl font-black text-gray-900">Lead pipeline will appear here</h2>
              <p className="mt-2 text-gray-600">No demo contacts. No fake emails. Results show only after SayOK finishes a real search.</p>
            </div>
          )}

          {result && (
            <div className="relative space-y-5">
              {!canViewResults && (
                <EmailGateOverlay
                  leadCount={result.leads.length}
                  verifiedEmailCount={verifiedEmailCount}
                  email={captureEmail}
                  marketingConsent={marketingConsent}
                  isSubmitting={isCapturingEmail}
                  onEmailChange={setCaptureEmail}
                  onConsentChange={setMarketingConsent}
                  onGoogleLogin={handleLogin}
                  onEmailSubmit={captureEmailAndUnlock}
                />
              )}
              <div className={!canViewResults ? 'pointer-events-none select-none blur-md' : ''}>
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Website analysis</p>
                    <h2 className="mt-1 text-2xl font-black text-gray-950">{result.analysis.product}</h2>
                    <p className="mt-2 text-gray-600">{result.analysis.positioning}</p>
                  </div>
                  <button onClick={exportCsv} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-800 transition hover:bg-gray-50">Export CSV</button>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}

              <LeadCards leads={result.leads} contactsByLead={contactsByLead} outreachByContact={outreachByContact} outreachByLead={outreachByLead} copied={copied} onCopy={copyText} />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function PipelineStatus({ isLoading, result }: { isLoading: boolean; result: LeadDiscoveryResult | null }) {
  const steps = [
    ['Read site', result?.integrationStatus.firecrawl],
    ['Understand offer', result?.integrationStatus.llm],
    ['Find targets', result?.integrationStatus.brave],
    ['Find emails', result?.integrationStatus.hunter],
    ['Write outreach', result?.outreach.length ? 'ready' : result ? 'no email yet' : undefined],
  ]

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-5">
      {steps.map(([label, status], index) => {
        const labelText = status || (isLoading ? 'running' : 'waiting')
        const done = Boolean(status)
        return (
        <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
          <div className={`mb-2 h-2 rounded-full ${done ? 'bg-green-500' : isLoading && index === 0 ? 'bg-orange-300' : 'bg-gray-200'}`} />
          <p className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-gray-800">{labelText}</p>
        </div>
        )
      })}
    </div>
  )
}

function EmailGateOverlay({
  leadCount,
  verifiedEmailCount,
  email,
  marketingConsent,
  isSubmitting,
  onEmailChange,
  onConsentChange,
  onGoogleLogin,
  onEmailSubmit,
}: {
  leadCount: number
  verifiedEmailCount: number
  email: string
  marketingConsent: boolean
  isSubmitting: boolean
  onEmailChange: (value: string) => void
  onConsentChange: (value: boolean) => void
  onGoogleLogin: () => void
  onEmailSubmit: () => void
}) {
  return (
    <div className="absolute inset-x-0 top-10 z-10 mx-auto max-w-md rounded-2xl border border-orange-200 bg-white p-5 shadow-2xl shadow-orange-100">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Results ready</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-gray-950">
        {leadCount} leads found · {verifiedEmailCount} emails verified
      </h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">Sign in or enter your email to view the contacts and drafts.</p>
      <button type="button" onClick={onGoogleLogin} className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-black text-white hover:bg-gray-800">
        Continue with Google
      </button>
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-bold uppercase text-gray-400">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <label className="block text-sm font-bold text-gray-800">Email</label>
      <input
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        type="email"
        placeholder="you@company.com"
        className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      />
      <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-gray-600">
        <input
          checked={marketingConsent}
          onChange={(event) => onConsentChange(event.target.checked)}
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <span>Send me relevant tips and offers about lead generation and Japan market entry.</span>
      </label>
      <button
        type="button"
        onClick={onEmailSubmit}
        disabled={isSubmitting}
        className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
      >
        {isSubmitting ? 'Unlocking...' : 'View results'}
      </button>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Consent is optional and results unlock either way. See our <a href="/privacy" className="font-bold text-orange-700 underline">privacy policy</a>.
      </p>
    </div>
  )
}

function LeadCards({
  leads,
  contactsByLead,
  outreachByContact,
  outreachByLead,
  copied,
  onCopy,
}: {
  leads: Lead[]
  contactsByLead: Map<string, Contact[]>
  outreachByContact: Map<string, OutreachMessage>
  outreachByLead: Map<string, OutreachMessage>
  copied: string
  onCopy: (label: string, text: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
        <h2 className="text-2xl font-black text-gray-950">Outreach queue</h2>
        <p className="mt-1 text-sm text-gray-500">Each card shows the best available contact and the email SayOK recommends sending next.</p>
      </div>
      {leads.map((lead) => {
        const contacts = contactsByLead.get(lead.id) || []
        const contact = contacts[0] || null
        const outreach = contact ? outreachByContact.get(contact.id) || outreachByLead.get(lead.id) || null : outreachByLead.get(lead.id) || null
        return <LeadCard key={lead.id} lead={lead} contact={contact} outreach={outreach} copied={copied} onCopy={onCopy} />
      })}
    </div>
  )
}

function LeadCard({
  lead,
  contact,
  outreach,
  copied,
  onCopy,
}: {
  lead: Lead
  contact: Contact | null
  outreach: OutreachMessage | null
  copied: string
  onCopy: (label: string, text: string) => void
}) {
  const emailCopyLabel = outreach ? `${lead.id}:${contact?.id}:email` : ''
  const addressCopyLabel = contact?.email ? `${lead.id}:${contact.id}:address` : ''
  const gmailUrl = contact?.email && outreach ? buildGmailComposeUrl(contact.email, outreach.subject, outreach.email) : ''
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black uppercase text-orange-700">{lead.status.replaceAll('_', ' ')}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">{lead.category} · {Math.round(lead.confidence * 100)}% fit</span>
          </div>
          <h3 className="mt-3 text-2xl font-black leading-tight text-gray-950">{lead.organizationName}</h3>
          <a href={lead.organizationWebsite} target="_blank" className="mt-2 inline-block break-all text-sm font-bold text-orange-600 hover:underline">{displayHostname(lead.organizationWebsite)}</a>
          <p className="mt-3 text-sm leading-6 text-gray-600">{lead.reasonForFit}</p>
          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">Recommended contact</p>
            {contact ? (
              <div className="mt-2 space-y-2">
                <p className="font-black text-gray-950">{contact.title || 'Public contact'}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all rounded-lg bg-white px-3 py-2 text-sm font-bold text-gray-900">{contact.email}</span>
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${contact.emailStatus === 'verified' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>{contact.emailStatus}</span>
                  <button onClick={() => onCopy(addressCopyLabel, contact.email)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-white">{copied === addressCopyLabel ? 'Copied' : 'Copy address'}</button>
                </div>
                <a href={contact.sourceUrl || lead.sourceUrl} target="_blank" className="inline-block text-xs font-bold text-gray-500 underline decoration-gray-300 underline-offset-4">Contact source</a>
              </div>
            ) : (
              <p className="mt-2 text-sm font-semibold text-gray-500">No email found yet. Use the draft for a contact form, LinkedIn, or the partnerships/licensing team.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-orange-100 bg-orange-50/30 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-orange-700">Send this email</p>
              <h4 className="mt-1 text-lg font-black text-gray-950">{outreach?.subject || 'No outreach generated yet'}</h4>
            </div>
            {outreach && (
              <div className="flex flex-wrap gap-2">
                {gmailUrl && (
                  <a href={gmailUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600">
                    Open in Gmail
                  </a>
                )}
                <button onClick={() => onCopy(emailCopyLabel, outreach.email)} className="rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-black text-orange-700 hover:bg-orange-50">{copied === emailCopyLabel ? 'Copied' : 'Copy email'}</button>
              </div>
            )}
          </div>
          {outreach ? (
            <div className="mt-4 space-y-4">
              <p className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-gray-700">{outreach.email}</p>
              <details className="rounded-xl bg-white p-4">
                <summary className="cursor-pointer text-sm font-black text-gray-800">Follow-up</summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{outreach.followUp}</p>
              </details>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-white p-4 text-sm font-semibold text-gray-500">No draft generated for this lead yet.</p>
          )}
        </div>
      </div>
    </article>
  )
}

function buildGmailComposeUrl(to: string, subject: string, body: string) {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to,
    su: subject,
    body,
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}

function displayHostname(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
  } catch {
    return url
  }
}
