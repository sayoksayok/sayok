import assert from 'node:assert/strict'
import { classifyBounce, parseBounceMessage } from '../src/lib/sales-agent-bounce-audit.ts'

const encode = (value) => Buffer.from(value, 'utf8').toString('base64url')

const hardMessage = {
  id: 'hard-1',
  threadId: 'thread-hard',
  internalDate: String(Date.parse('2026-08-01T10:00:00Z')),
  payload: {
    headers: [
      { name: 'From', value: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' },
      { name: 'Subject', value: 'Delivery Status Notification (Failure)' },
      { name: 'X-Failed-Recipients', value: 'missing@example.org' },
    ],
    parts: [{
      mimeType: 'message/delivery-status',
      body: { data: encode('Final-Recipient: rfc822; missing@example.org\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 The email account does not exist') },
    }],
  },
}

const parsedHard = parseBounceMessage(hardMessage, new Set(['missing@example.org']))
assert.equal(parsedHard.length, 1)
assert.equal(parsedHard[0].recipientEmail, 'missing@example.org')
assert.equal(parsedHard[0].bounceType, 'hard')
assert.equal(parsedHard[0].smtpCode, '5.1.1')

const soft = classifyBounce('Diagnostic-Code: smtp; 421 4.7.0 Temporary system problem')
assert.equal(soft.bounceType, 'soft')
assert.equal(soft.smtpCode, '4.7.0')

const ignored = parseBounceMessage(hardMessage, new Set(['different@example.org']))
assert.equal(ignored.length, 0)

console.log('sales-agent bounce audit parser: ok')
