import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';

export type ResolvedTier = 'guest' | 'free' | 'pro';

export type UsageIdentity = {
  identityKey: string;
  tier: ResolvedTier;
  dailyLimit: number;
};

const LIMITS: Record<ResolvedTier, number> = {
  guest: 2,
  free: 5,
  pro: 100,
};

function usageSalt(): string {
  return (
    process.env.SAYOK_USAGE_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 40) ||
    'sayok-dev-salt-change-in-production'
  );
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function anonIdentityKey(ip: string): string {
  const h = createHmac('sha256', usageSalt()).update(ip).digest('hex').slice(0, 48);
  return `a:${h}`;
}

export function userIdentityKey(userId: string): string {
  return `u:${userId}`;
}

export function isUsageEnforced(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function resolveTierFromRequest(
  accessToken: string | undefined,
): Promise<{ tier: ResolvedTier; userId: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !url || !anon) {
    return { tier: 'guest', userId: null };
  }

  const authClient = createClient(url, anon);
  const { data: { user }, error } = await authClient.auth.getUser(accessToken);
  if (error || !user) {
    return { tier: 'guest', userId: null };
  }

  const admin = getAdminClient();
  if (!admin) {
    return { tier: 'free', userId: user.id };
  }

  const { data: row } = await admin.from('users').select('is_pro').eq('id', user.id).maybeSingle();
  const pro = Boolean(row?.is_pro);
  return { tier: pro ? 'pro' : 'free', userId: user.id };
}

export async function tryConsumeDailyCheck(identity: UsageIdentity, usageDate: string): Promise<boolean> {
  const admin = getAdminClient();
  if (!admin) return true;

  const { data, error } = await admin.rpc('sayok_try_consume_check', {
    p_identity: identity.identityKey,
    p_usage_date: usageDate,
    p_limit: identity.dailyLimit,
  });

  if (error) {
    console.error('sayok_try_consume_check:', error);
    return true;
  }

  const ok = Boolean((data as { ok?: boolean })?.ok);
  return ok;
}

export async function refundDailyCheck(identityKey: string, usageDate: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc('sayok_refund_check', {
    p_identity: identityKey,
    p_usage_date: usageDate,
  });
  if (error) console.error('sayok_refund_check:', error);
}

export function buildUsageIdentity(
  tier: ResolvedTier,
  userId: string | null,
  request: NextRequest,
): UsageIdentity {
  if (userId) {
    return {
      identityKey: userIdentityKey(userId),
      tier,
      dailyLimit: LIMITS[tier],
    };
  }
  return {
    identityKey: anonIdentityKey(getClientIp(request)),
    tier: 'guest',
    dailyLimit: LIMITS.guest,
  };
}
