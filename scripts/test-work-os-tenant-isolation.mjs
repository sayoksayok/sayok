import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

function userClient() {
  return createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
}

const stamp = Date.now();
const password = `SayOK-test-${stamp}!`;
const emailA = `sayok-tenant-a-${stamp}@example.com`;
const emailB = `sayok-tenant-b-${stamp}@example.com`;

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function signIn(email) {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function main() {
  const userA = await createConfirmedUser(emailA);
  const userB = await createConfirmedUser(emailB);
  const clientA = await signIn(emailA);
  const clientB = await signIn(emailB);

  const workspaceId = crypto.randomUUID();
  const { error: workspaceError } = await clientA.from('work_os_workspaces').insert({
    id: workspaceId,
    owner_id: userA.id,
    name: 'Tenant A workspace',
    timezone: 'Asia/Tokyo',
  });
  if (workspaceError) throw workspaceError;

  const { error: memberError } = await clientA.from('work_os_members').insert({
    workspace_id: workspaceId,
    user_id: userA.id,
    role: 'owner',
  });
  if (memberError) throw memberError;

  const { error: taskError } = await clientA.from('work_os_tasks').insert({
    workspace_id: workspaceId,
    title: 'Private tenant A task',
    owner_name: 'Me',
    source: 'tenant_test',
    status: 'inbox',
    priority: 'medium',
  });
  if (taskError) throw taskError;

  const { data: ownRows, error: ownReadError } = await clientA.from('work_os_tasks').select('id,title').eq('workspace_id', workspaceId);
  if (ownReadError) throw ownReadError;
  if (!ownRows?.length) throw new Error('User A cannot read own workspace task');

  const { data: leakedRows, error: leakReadError } = await clientB.from('work_os_tasks').select('id,title').eq('workspace_id', workspaceId);
  if (leakReadError) throw leakReadError;
  if (leakedRows?.length) throw new Error('Tenant isolation failed: User B can read Workspace A data');

  const { error: crossWriteError } = await clientB.from('work_os_tasks').insert({
    workspace_id: workspaceId,
    title: 'Cross tenant write attempt',
    owner_name: 'Me',
    source: 'tenant_test',
    status: 'inbox',
    priority: 'medium',
  });
  if (!crossWriteError) throw new Error('Tenant isolation failed: User B can write into Workspace A');

  await admin.from('work_os_workspaces').delete().eq('id', workspaceId);
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);

  console.log('Tenant isolation passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
