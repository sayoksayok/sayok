import { NextResponse, type NextRequest } from 'next/server';
import { createGmailDraft, getValidGoogleAccessToken, type GoogleConnection } from '@/lib/google-work-os';
import { jsonError, requireWorkOsUser, requireWorkspaceMember } from '@/lib/work-os-server';

export async function POST(request: NextRequest) {
  const context = await requireWorkOsUser(request);
  if (context instanceof NextResponse) return context;

  const body = (await request.json().catch(() => null)) as {
    workspaceId?: string;
    taskId?: string;
    to?: string;
    subject?: string;
    body?: string;
  } | null;

  if (!body?.workspaceId) return jsonError('workspaceId is required');
  if (!body.to || !body.subject || !body.body) return jsonError('to, subject, and body are required');
  const member = await requireWorkspaceMember(context.admin, body.workspaceId, context.user.id);
  if (!member) return jsonError('Not authorized for workspace', 403);

  const { data, error } = await context.admin
    .from('work_os_google_connections')
    .select('*')
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', context.user.id)
    .eq('status', 'connected')
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError('Google is not connected for this workspace', 409);

  const connection = data as GoogleConnection;
  if (!connection.gmail_connected) return jsonError('Gmail compose permission is not connected', 409);

  try {
    const accessToken = await getValidGoogleAccessToken(context.admin, connection);
    const draft = await createGmailDraft(accessToken, { to: body.to, subject: body.subject, body: body.body });
    const { data: prepared, error: preparedError } = await context.admin
      .from('work_os_prepared_work')
      .insert({
        workspace_id: body.workspaceId,
        task_id: body.taskId || null,
        kind: 'gmail_draft',
        title: `Gmail draft: ${body.subject}`,
        body: body.body,
        status: 'prepared',
      })
      .select('*')
      .single();
    if (preparedError) return jsonError(preparedError.message, 500);

    await context.admin.from('work_os_activity_events').insert({
      workspace_id: body.workspaceId,
      task_id: body.taskId || null,
      actor_type: 'integration',
      event_type: 'gmail_draft_created',
      summary: `Created Gmail draft for ${body.to}. It was not sent.`,
      payload: { draft_id: draft.id, message_id: draft.message?.id },
    });

    return NextResponse.json({ ok: true, draft, prepared });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create Gmail draft';
    return jsonError(message, 500);
  }
}
