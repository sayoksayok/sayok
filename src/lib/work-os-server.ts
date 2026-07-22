import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tokenEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';

export type WorkOsServerContext = {
  admin: SupabaseClient;
  user: User;
};

export function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireWorkOsUser(request: NextRequest): Promise<WorkOsServerContext | NextResponse> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase server environment is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  return { admin, user: data.user };
}

export async function requireWorkspaceMember(admin: SupabaseClient, workspaceId: string, userId: string) {
  const { data, error } = await admin
    .from('work_os_members')
    .select('workspace_id,user_id,role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as { workspace_id: string; user_id: string; role: 'owner' | 'admin' | 'member' };
}

function encryptionKey() {
  if (!tokenEncryptionKey || tokenEncryptionKey.length < 16) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be set to a long random string');
  }
  return createHash('sha256').update(tokenEncryptionKey).digest();
}

export function encryptToken(value: string | null | undefined) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptToken(value: string | null | undefined) {
  if (!value) return null;
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
