import { NextResponse, type NextRequest } from 'next/server'
import { requireWorkOsUser, type WorkOsServerContext } from '@/lib/work-os-server'

export type SalesAgentServerContext = WorkOsServerContext & {
  workspaceId: string
}

export async function requireSalesAgentUser(
  request: NextRequest,
): Promise<SalesAgentServerContext | NextResponse> {
  const context = await requireWorkOsUser(request)
  if (context instanceof NextResponse) return context

  const email = context.user.email?.trim().toLowerCase() || ''
  if (!email) return NextResponse.json({ error: 'Googleアカウントのメールを確認できません。' }, { status: 403 })

  const { data: existingWorkspace, error: workspaceLookupError } = await context.admin
    .from('work_os_workspaces')
    .select('id')
    .eq('owner_id', context.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (workspaceLookupError) {
    return NextResponse.json({ error: workspaceLookupError.message }, { status: 500 })
  }

  let workspaceId = existingWorkspace?.id as string | undefined
  if (!workspaceId) {
    const displayName = String(
      context.user.user_metadata?.full_name
      || context.user.user_metadata?.name
      || email,
    ).trim()
    const { data: createdWorkspace, error: createWorkspaceError } = await context.admin
      .from('work_os_workspaces')
      .insert({
        owner_id: context.user.id,
        name: `${displayName} Sales`,
        company_name: null,
        timezone: 'Asia/Tokyo',
      })
      .select('id')
      .single()
    if (createWorkspaceError || !createdWorkspace) {
      return NextResponse.json(
        { error: createWorkspaceError?.message || '営業ワークスペースを作成できませんでした。' },
        { status: 500 },
      )
    }
    workspaceId = createdWorkspace.id as string
  }

  const { error: memberError } = await context.admin.from('work_os_members').upsert({
    workspace_id: workspaceId,
    user_id: context.user.id,
    role: 'owner',
  }, { onConflict: 'workspace_id,user_id' })
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  return { ...context, workspaceId }
}
