import { NextResponse, type NextRequest } from 'next/server';
import { encryptToken, jsonError, requireWorkOsUser, requireWorkspaceMember } from '@/lib/work-os-server';

const gmailReadonlyScope = 'https://www.googleapis.com/auth/gmail.readonly';
const gmailComposeScope = 'https://www.googleapis.com/auth/gmail.compose';
const calendarReadonlyScope = 'https://www.googleapis.com/auth/calendar.readonly';

export async function POST(request: NextRequest) {
  const context = await requireWorkOsUser(request);
  if (context instanceof NextResponse) return context;

  const body = (await request.json().catch(() => null)) as {
    workspaceId?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    scopes?: string[];
    googleEmail?: string;
  } | null;

  if (!body?.workspaceId) return jsonError('workspaceId is required');
  if (!body.accessToken) return jsonError('Google access token is required');

  const member = await requireWorkspaceMember(context.admin, body.workspaceId, context.user.id);
  if (!member) return jsonError('Not authorized for workspace', 403);

  const scopes = body.scopes || [];
  const { error: profileError } = await context.admin.from('work_os_user_profiles').upsert({
    user_id: context.user.id,
    email: context.user.email || body.googleEmail || '',
    full_name: context.user.user_metadata?.full_name || context.user.user_metadata?.name || null,
    avatar_url: context.user.user_metadata?.avatar_url || null,
    auth_provider: 'google',
    updated_at: new Date().toISOString(),
  });
  if (profileError) return jsonError(profileError.message, 500);

  const { error } = await context.admin.from('work_os_google_connections').upsert(
    {
      workspace_id: body.workspaceId,
      user_id: context.user.id,
      google_email: body.googleEmail || context.user.email || null,
      encrypted_access_token: encryptToken(body.accessToken),
      encrypted_refresh_token: body.refreshToken ? encryptToken(body.refreshToken) : undefined,
      token_expires_at: body.expiresAt || null,
      scopes,
      gmail_connected: scopes.includes(gmailReadonlyScope) || scopes.includes(gmailComposeScope),
      calendar_connected: scopes.includes(calendarReadonlyScope),
      status: 'connected',
      last_error: null,
      disconnected_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,user_id' },
  );

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
