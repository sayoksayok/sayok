import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, requireWorkOsUser, requireWorkspaceMember } from '@/lib/work-os-server';

export async function GET(request: NextRequest) {
  const context = await requireWorkOsUser(request);
  if (context instanceof NextResponse) return context;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return jsonError('workspaceId is required');
  const member = await requireWorkspaceMember(context.admin, workspaceId, context.user.id);
  if (!member) return jsonError('Not authorized for workspace', 403);

  const [connectionRes, lastRunRes] = await Promise.all([
    context.admin
      .from('work_os_google_connections')
      .select('google_email,scopes,gmail_connected,calendar_connected,status,last_sync_at,last_error,connected_at,disconnected_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', context.user.id)
      .maybeSingle(),
    context.admin
      .from('work_os_sync_runs')
      .select('status,gmail_threads_seen,calendar_events_seen,tasks_created,drafts_created,error,started_at,finished_at')
      .eq('workspace_id', workspaceId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (connectionRes.error) return jsonError(connectionRes.error.message, 500);
  if (lastRunRes.error) return jsonError(lastRunRes.error.message, 500);

  return NextResponse.json({
    connection: connectionRes.data || null,
    lastRun: lastRunRes.data || null,
    role: member.role,
  });
}
