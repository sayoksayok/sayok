import { checkGoogleSenderDomainAuth } from '../src/lib/sales-agent-domain-auth.ts'

const domains = process.argv.slice(2)
const targets = domains.length
  ? domains
  : ['ownthedoge.com', 'looq.icu', 'kakehashijapan.com']

let failed = false
for (const value of targets) {
  const email = value.includes('@') ? value : `postmaster@${value}`
  try {
    const result = await checkGoogleSenderDomainAuth(email)
    console.log(JSON.stringify(result, null, 2))
    if (!result.pass) failed = true
  } catch (error) {
    failed = true
    console.error(`${email}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

process.exitCode = failed ? 1 : 0
