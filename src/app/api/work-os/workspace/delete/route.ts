import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, requireWorkOsUser, requireWorkspaceMember } from '@/lib/work-os-server';

export async function POST(request: NextRequest) {
  const context = await requireWorkOsUser(request);
  if (context instanceof NextResponse) return context;
  const body = (await request.json().catch(() => null)) as { workspaceId?: string } | null;
  if (!body?.workspaceId) return jsonError('workspaceId is required');
  const member = await requireWorkspaceMember(context.admin, body.workspaceId, context.user.id);
  if (!member || !['owner', 'admin'].includes(member.role)) return jsonError('Only owner/admin can delete workspace', 403);

  const { error } = await context.admin.rpc('delete_work_os_workspace', { target_workspace_id: body.workspaceId });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
