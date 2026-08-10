import assert from 'node:assert/strict'
import { evaluateDomainAuthRecords } from '../src/lib/sales-agent-domain-auth.ts'

const passing = evaluateDomainAuthRecords(
  'example.com',
  ['google-site-verification=abc', 'v=spf1 include:_spf.google.com ~all'],
  ['v=DKIM1; k=rsa; p=abc123'],
  ['v=DMARC1; p=none;'],
)
assert.equal(passing.pass, true)
assert.equal(passing.spf.pass, true)
assert.equal(passing.dkim.pass, true)
assert.equal(passing.dmarc.pass, true)

const missing = evaluateDomainAuthRecords(
  'example.com',
  ['v=spf1 include:mail.example.com ~all'],
  [],
  [],
)
assert.equal(missing.pass, false)
assert.equal(missing.failures.length, 3)

const duplicateDmarc = evaluateDomainAuthRecords(
  'example.com',
  ['v=spf1 include:_spf.google.com ~all'],
  ['v=DKIM1; k=rsa; p=abc123'],
  ['v=DMARC1; p=none;', 'v=DMARC1; p=reject;'],
)
assert.equal(duplicateDmarc.pass, false)
assert.equal(duplicateDmarc.dmarc.pass, false)
assert.match(duplicateDmarc.dmarc.reason, /2/)

console.log('sales-agent domain authentication tests passed')
