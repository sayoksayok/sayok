import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function hasValue(value: string | undefined) {
  return Boolean(value && value.trim() && !value.includes('your_') && !value.includes('_here'));
}

async function checkSupabaseReachable() {
  if (!hasValue(supabaseUrl) || !hasValue(supabaseAnonKey)) {
    return { reachable: false, status: null as number | null, error: 'missing_public_supabase_env' };
  }

  try {
    const url = new URL('/auth/v1/health', supabaseUrl);
    const response = await fetch(url, {
      headers: { apikey: supabaseAnonKey },
      cache: 'no-store',
    });
    return { reachable: response.ok, status: response.status, error: response.ok ? null : 'supabase_health_check_failed' };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      error: error instanceof Error ? error.message : 'supabase_health_check_failed',
    };
  }
}

export async function GET() {
  const health = await checkSupabaseReachable();
  const supabaseHost = (() => {
    if (!hasValue(supabaseUrl)) return null;
    try {
      return new URL(supabaseUrl).host;
    } catch {
      return 'invalid-url';
    }
  })();
  const missing = [
    !hasValue(supabaseUrl) ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
    !hasValue(supabaseAnonKey) ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : null,
    !hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
    !hasValue(process.env.GOOGLE_CLIENT_ID) ? 'GOOGLE_CLIENT_ID' : null,
    !hasValue(process.env.GOOGLE_CLIENT_SECRET) ? 'GOOGLE_CLIENT_SECRET' : null,
    !hasValue(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) ? 'GOOGLE_TOKEN_ENCRYPTION_KEY' : null,
  ].filter(Boolean);

  return NextResponse.json({
    supabase: {
      configured: hasValue(supabaseUrl) && hasValue(supabaseAnonKey),
      reachable: health.reachable,
      status: health.status,
      error: health.error,
      host: supabaseHost,
    },
    googleIntegration: {
      configured:
        hasValue(process.env.GOOGLE_CLIENT_ID) &&
        hasValue(process.env.GOOGLE_CLIENT_SECRET) &&
        hasValue(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    },
    missing,
  });
}
