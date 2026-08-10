'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type AuditReport = {
  totalSent: number
  hardBounceCount: number
  hardBounceRate: number
  softBounceCount: number
  softBounceRate: number
  emailSourceAttribution: {
    mxOnlyHardBounceCount: number
    hardBouncesWithKnownSource: number
    hardBouncesWithUnknownSource: number
    mxOnlyRateAmongKnownHardBounces: number | null
    note: string | null
  }
}

export default function BounceAuditPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<AuditReport | null>(null)

  async function runAudit() {
    setBusy(true)
    setError('')
    try {
      if (!supabase) throw new Error('Supabase authentication is not configured.')
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!data.session?.access_token) throw new Error('Log in to SayOK before running this audit.')

      const response = await fetch('/api/sales-agent/audit-bounces', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The bounce audit failed.')
      setReport(result as AuditReport)
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : 'The bounce audit failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f3f0] px-4 py-12 text-[#20242b]">
      <section className="mx-auto max-w-2xl rounded-lg border border-[#d9dbd5] bg-white p-8">
        <p className="text-xs font-black tracking-[0.16em] text-[#bc3f34]">INTERNAL DIAGNOSTIC</p>
        <h1 className="mt-3 text-3xl font-black">Gmail bounce audit</h1>
        <p className="mt-3 text-sm leading-6 text-[#5f656c]">
          Read-only: compares Gmail delivery failures with this workspace&apos;s recorded sales sends.
        </p>
        <button
          type="button"
          onClick={runAudit}
          disabled={busy}
          className="mt-6 rounded-md bg-[#2b4c7e] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? 'Checking Gmail…' : 'Run bounce audit'}
        </button>
        {error && <p className="mt-5 rounded-md bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
        {report && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <Metric label="Total sends" value={report.totalSent} />
            <Metric label="Hard bounces" value={`${report.hardBounceCount} (${report.hardBounceRate}%)`} />
            <Metric label="Soft bounces" value={`${report.softBounceCount} (${report.softBounceRate}%)`} />
            <Metric
              label="MX-only among attributable hard bounces"
              value={report.emailSourceAttribution.mxOnlyRateAmongKnownHardBounces === null
                ? 'Not measurable'
                : `${report.emailSourceAttribution.mxOnlyRateAmongKnownHardBounces}%`}
            />
            {report.emailSourceAttribution.note && (
              <p className="sm:col-span-2 rounded-md bg-amber-50 p-4 text-sm font-bold text-amber-900">
                {report.emailSourceAttribution.note}
              </p>
            )}
          </dl>
        )}
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#d9dbd5] p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-[#6f747b]">{label}</dt>
      <dd className="mt-2 text-2xl font-black">{value}</dd>
    </div>
  )
}
