import { createHmac, timingSafeEqual } from 'node:crypto'

type OAuthState = {
  userId: string
  workspaceId: string
  returnTo: string
  expiresAt: number
  nonce: string
}

export function createSalesGoogleOAuthState(input: Omit<OAuthState, 'expiresAt' | 'nonce'>) {
  const payload: OAuthState = {
    ...input,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomUUID(),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded)}`
}

export function verifySalesGoogleOAuthState(value: string): OAuthState {
  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) throw new Error('Google接続のstateが不正です。')
  const expected = sign(encoded)
  const receivedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new Error('Google接続のstate署名を確認できません。')
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthState
  if (!payload.userId || !payload.workspaceId || payload.expiresAt < Date.now()) {
    throw new Error('Google接続の有効期限が切れました。')
  }
  return payload
}

function sign(value: string) {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || ''
  if (secret.length < 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be at least 32 characters.')
  return createHmac('sha256', secret).update(value).digest('base64url')
}
