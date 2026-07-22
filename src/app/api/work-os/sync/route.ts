import { NextResponse, type NextRequest } from 'next/server';
import {
  getValidGoogleAccessToken,
  isActionableEmail,
  listCalendarEvents,
  listRecentGmailMessages,
  parseGmailMessage,
  type GoogleConnection,
} from '@/lib/google-work-os';
import { jsonError, requireWorkOsUser, requireWorkspaceMember } from '@/lib/work-os-server';

export async function POST(request: NextRequest) {
  const context = await requireWorkOsUser(request);
  if (context instanceof NextResponse) return context;

  const body = (await request.json().catch(() => null)) as { workspaceId?: string } | null;
  if (!body?.workspaceId) return jsonError('workspaceId is required');
  const member = await requireWorkspaceMember(context.admin, body.workspaceId, context.user.id);
  if (!member) return jsonError('Not authorized for workspace', 403);

  const { data: connectionData, error: connectionError } = await context.admin
    .from('work_os_google_connections')
    .select('*')
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', context.user.id)
    .eq('status', 'connected')
    .maybeSingle();
  if (connectionError) return jsonError(connectionError.message, 500);
  if (!connectionData) return jsonError('Google is not connected for this workspace', 409);

  const { data: run, error: runError } = await context.admin
    .from('work_os_sync_runs')
    .insert({ workspace_id: body.workspaceId, user_id: context.user.id, status: 'running' })
    .select('*')
    .single();
  if (runError) return jsonError(runError.message, 500);

  let gmailSeen = 0;
  let calendarSeen = 0;
  let tasksCreated = 0;

  try {
    const connection = connectionData as GoogleConnection;
    const accessToken = await getValidGoogleAccessToken(context.admin, connection);

    if (connection.gmail_connected) {
      const messages = await listRecentGmailMessages(accessToken);
      gmailSeen = messages.length;
      for (const message of messages) {
        const parsed = parseGmailMessage(message);
        await context.admin.from('work_os_external_messages').upsert(
          {
            workspace_id: body.workspaceId,
            provider: 'gmail',
            ...parsed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,provider,external_id' },
        );

        if (isActionableEmail(parsed.subject || '', parsed.snippet || '')) {
          const existing = await context.admin
            .from('work_os_tasks')
            .select('id')
            .eq('workspace_id', body.workspaceId)
            .eq('related_email', parsed.source_url)
            .maybeSingle();

          if (!existing.data) {
            const { error } = await context.admin.from('work_os_tasks').insert({
              workspace_id: body.workspaceId,
              title: `Review email: ${parsed.subject}`,
              description: parsed.snippet,
              client_company: parsed.from_name || parsed.from_email,
              owner_name: 'Me',
              source: 'gmail_sync',
              status: 'inbox',
              priority: 'medium',
              due_at: new Date().toISOString(),
              related_email: parsed.source_url,
              agent_notes: 'Created from a real Gmail thread because it appears to require a reply, meeting, proposal, or next decision.',
              last_event_at: new Date().toISOString(),
            });
            if (!error) tasksCreated += 1;
          }
        }
      }
    }

    if (connection.calendar_connected) {
      const events = await listCalendarEvents(accessToken);
      calendarSeen = events.length;
      for (const event of events) {
        await context.admin.from('work_os_calendar_events').upsert(
          {
            workspace_id: body.workspaceId,
            provider: 'google_calendar',
            external_id: event.id,
            title: event.summary || '(untitled event)',
            description: event.description || null,
            location: event.location || null,
            start_at: event.start?.dateTime || event.start?.date || null,
            end_at: event.end?.dateTime || event.end?.date || null,
            attendees: event.attendees || [],
            source_url: event.htmlLink || null,
            raw: event,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,provider,external_id' },
        );
      }
    }

    await context.admin.from('work_os_activity_events').insert({
      workspace_id: body.workspaceId,
      actor_type: 'integration',
      event_type: 'google_sync_completed',
      summary: `Synced ${gmailSeen} Gmail threads and ${calendarSeen} Calendar events. Created ${tasksCreated} tasks.`,
      payload: { gmailSeen, calendarSeen, tasksCreated },
    });

    await Promise.all([
      context.admin
        .from('work_os_sync_runs')
        .update({
          status: 'success',
          gmail_threads_seen: gmailSeen,
          calendar_events_seen: calendarSeen,
          tasks_created: tasksCreated,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id),
      context.admin
        .from('work_os_google_connections')
        .update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', body.workspaceId)
        .eq('user_id', context.user.id),
    ]);

    return NextResponse.json({ ok: true, gmailSeen, calendarSeen, tasksCreated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    await Promise.all([
      context.admin.from('work_os_sync_runs').update({ status: 'error', error: message, finished_at: new Date().toISOString() }).eq('id', run.id),
      context.admin
        .from('work_os_google_connections')
        .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
        .eq('workspace_id', body.workspaceId)
        .eq('user_id', context.user.id),
    ]);
    return jsonError(message, 500);
  }
}
