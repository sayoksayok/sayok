import { NextResponse, type NextRequest } from 'next/server';
import { decryptToken, jsonError, requireWorkOsUser, requireWorkspaceMember } from '@/lib/work-os-server';
import type { GoogleConnection } from '@/lib/google-work-os';

export async function POST(request: NextRequest) {
  const context = await requireWorkOsUser(request);
  if (context instanceof NextResponse) return context;

  const body = (await request.json().catch(() => null)) as { workspaceId?: string } | null;
  if (!body?.workspaceId) return jsonError('workspaceId is required');
  const member = await requireWorkspaceMember(context.admin, body.workspaceId, context.user.id);
  if (!member) return jsonError('Not authorized for workspace', 403);

  const { data, error: loadError } = await context.admin
    .from('work_os_google_connections')
    .select('*')
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (loadError) return jsonError(loadError.message, 500);

  const connection = data as GoogleConnection | null;
  const accessToken = connection ? decryptToken(connection.encrypted_access_token) : null;
  if (accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST' }).catch(() => null);
  }

  const { error } = await context.admin
    .from('work_os_google_connections')
    .update({
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      gmail_connected: false,
      calendar_connected: false,
      status: 'revoked',
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', context.user.id);

  if (error) return jsonError(error.message, 500);
  await context.admin.from('work_os_activity_events').insert({
    workspace_id: body.workspaceId,
    actor_type: 'user',
    event_type: 'google_disconnected',
    summary: 'Disconnected Google access for Gmail and Calendar.',
    payload: {},
  });
  return NextResponse.json({ ok: true });
}
