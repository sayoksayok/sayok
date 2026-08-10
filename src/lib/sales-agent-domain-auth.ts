import { resolveTxt } from 'node:dns/promises'

export type DomainAuthResult = {
  domain: string
  checkedAt: string
  pass: boolean
  spf: { pass: boolean; records: string[]; reason: string }
  dkim: { pass: boolean; records: string[]; reason: string }
  dmarc: { pass: boolean; records: string[]; reason: string }
  failures: string[]
}

const cache = new Map<string, { expiresAt: number; result: DomainAuthResult }>()
const cacheTtlMs = 60 * 60 * 1000

export async function checkGoogleSenderDomainAuth(email: string): Promise<DomainAuthResult> {
  const domain = email.split('@')[1]?.trim().toLowerCase() || ''
  if (!domain) throw new Error('送信元メールのドメインを確認できません。')
  const cached = cache.get(domain)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  const [root, dkim, dmarc] = await Promise.all([
    readTxt(domain),
    readTxt(`google._domainkey.${domain}`),
    readTxt(`_dmarc.${domain}`),
  ])
  const result = evaluateDomainAuthRecords(domain, root, dkim, dmarc)
  cache.set(domain, { expiresAt: Date.now() + cacheTtlMs, result })
  return result
}

export function evaluateDomainAuthRecords(
  domain: string,
  rootRecords: string[],
  dkimRecords: string[],
  dmarcRecords: string[],
): DomainAuthResult {
  const spfRecords = rootRecords.filter((record) => /^v=spf1\b/i.test(record.trim()))
  const spfPass = spfRecords.some((record) => /\binclude:_spf\.google\.com\b/i.test(record))
  const validDkim = dkimRecords.filter((record) => /^v=dkim1\b/i.test(record.trim()))
  const dkimPass = validDkim.length > 0
  const dmarcPass = dmarcRecords.length === 1 && /^v=dmarc1\b/i.test(dmarcRecords[0].trim())
  const failures = [
    !spfPass ? `SPF: ${domain} のTXTに include:_spf.google.com がありません。` : '',
    !dkimPass ? `DKIM: google._domainkey.${domain} に有効な v=DKIM1 レコードがありません。` : '',
    !dmarcPass
      ? `DMARC: _dmarc.${domain} は有効な v=DMARC1 TXTがちょうど1件必要です（現在 ${dmarcRecords.length} 件）。`
      : '',
  ].filter(Boolean)

  return {
    domain,
    checkedAt: new Date().toISOString(),
    pass: failures.length === 0,
    spf: {
      pass: spfPass,
      records: spfRecords,
      reason: spfPass ? 'Google Workspace SPFを確認しました。' : failures[0] || 'SPF不合格',
    },
    dkim: {
      pass: dkimPass,
      records: dkimRecords,
      reason: dkimPass ? 'Google DKIM selectorを確認しました。' : failures.find((item) => item.startsWith('DKIM:')) || 'DKIM不合格',
    },
    dmarc: {
      pass: dmarcPass,
      records: dmarcRecords,
      reason: dmarcPass ? '単一のDMARCレコードを確認しました。' : failures.find((item) => item.startsWith('DMARC:')) || 'DMARC不合格',
    },
    failures,
  }
}

async function readTxt(hostname: string) {
  try {
    return (await resolveTxt(hostname)).map((chunks) => chunks.join('').trim()).filter(Boolean)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (['ENOTFOUND', 'ENODATA', 'ENOTIMP', 'SERVFAIL'].includes(code)) return []
    throw error
  }
}
