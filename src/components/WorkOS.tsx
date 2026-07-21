'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  MessageSquarePlus,
  PauseCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import { getAuthCallbackUrl, supabase } from '@/lib/supabase';

type WorkStatus =
  | 'inbox'
  | 'needs_clarification'
  | 'ready'
  | 'in_progress'
  | 'prepared_by_sayok'
  | 'needs_user_approval'
  | 'scheduled'
  | 'waiting_on_someone'
  | 'delegated'
  | 'blocked'
  | 'done'
  | 'cancelled'
  | 'not_relevant'
  | 'archived';

type Priority = 'low' | 'medium' | 'high' | 'urgent';
type View = 'today' | 'inbox' | 'tasks' | 'projects' | 'waiting' | 'prepared' | 'calendar' | 'clients' | 'search' | 'activity' | 'settings';

type Workspace = {
  id: string;
  owner_id: string;
  name: string;
  company_name: string | null;
  timezone: string;
};

type Project = {
  id: string;
  workspace_id: string;
  name: string;
  business_area: string | null;
  client_company: string | null;
  status: 'active' | 'paused' | 'done' | 'archived';
  notes: string | null;
};

type WorkTask = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  client_company: string | null;
  owner_name: string;
  source: string;
  status: WorkStatus;
  priority: Priority;
  due_at: string | null;
  start_at: string | null;
  estimated_minutes: number | null;
  commercial_value: number | null;
  dependency: string | null;
  blocker: string | null;
  waiting_for_person: string | null;
  follow_up_at: string | null;
  related_email: string | null;
  related_meeting: string | null;
  related_opportunity: string | null;
  completion_record: Record<string, unknown> | null;
  agent_notes: string | null;
  user_notes: string | null;
  prepared_output: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
};

type Activity = {
  id: string;
  workspace_id: string;
  task_id: string | null;
  project_id: string | null;
  actor_type: 'user' | 'sayok' | 'integration';
  event_type: string;
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type PreparedWork = {
  id: string;
  workspace_id: string;
  task_id: string | null;
  kind: string;
  title: string;
  body: string;
  status: 'prepared' | 'approved' | 'rejected' | 'used';
  created_at: string;
};

const terminalStatuses: WorkStatus[] = ['done', 'cancelled', 'not_relevant', 'archived'];
const activeStatuses: WorkStatus[] = ['inbox', 'needs_clarification', 'ready', 'in_progress', 'prepared_by_sayok', 'needs_user_approval', 'scheduled', 'blocked'];
const navItems: { id: View; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'prepared', label: 'Prepared' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'clients', label: 'Clients' },
  { id: 'search', label: 'Search' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function isDueNow(task: WorkTask) {
  if (!task.due_at) return task.status === 'inbox' || task.status === 'ready' || task.status === 'needs_user_approval';
  return new Date(task.due_at).getTime() <= endOfToday().getTime();
}

function waitingFollowUpReached(task: WorkTask) {
  if (task.status !== 'waiting_on_someone') return false;
  if (!task.follow_up_at) return false;
  return new Date(task.follow_up_at).getTime() <= endOfToday().getTime();
}

function formatDate(value: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function inferPriority(text: string): Priority {
  const lower = text.toLowerCase();
  if (/urgent|today|overdue|now|asap|payment|invoice|client|deadline/.test(lower)) return 'high';
  if (/tomorrow|proposal|meeting|follow up|follow-up|send|prepare/.test(lower)) return 'medium';
  return 'medium';
}

function inferDueDate(text: string) {
  const lower = text.toLowerCase();
  const base = new Date();
  if (/today|now|asap/.test(lower)) return base.toISOString();
  if (/tomorrow/.test(lower)) {
    base.setDate(base.getDate() + 1);
    return base.toISOString();
  }
  if (/next week/.test(lower)) {
    base.setDate(base.getDate() + 7);
    return base.toISOString();
  }
  const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return new Date(`${iso}T09:00:00`).toISOString();
  return null;
}

function extractPerson(text: string) {
  const match = text.match(/\b(?:with|to|for|from|messaged|message|emailed|email|called|call|follow up with|follow-up with|delegate to|waiting on)\s+([A-Z][a-zA-Z-]+)/);
  return match?.[1] || null;
}

function cleanTitle(text: string) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export default function WorkOS() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>('today');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [prepared, setPrepared] = useState<PreparedWork[]>([]);
  const [quickCapture, setQuickCapture] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alreadyDoneTask, setAlreadyDoneTask] = useState<WorkTask | null>(null);
  const [alreadyDoneText, setAlreadyDoneText] = useState('');
  const [alreadyDoneChannel, setAlreadyDoneChannel] = useState('');
  const [alreadyDoneWaiting, setAlreadyDoneWaiting] = useState(true);
  const [alreadyDoneFollowUp, setAlreadyDoneFollowUp] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) || null;

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }
    void loadWorkspaces();
  }, [user]);

  useEffect(() => {
    if (workspaceId) void loadWorkspaceData(workspaceId);
  }, [workspaceId]);

  async function loadWorkspaces() {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from('work_os_workspaces').select('*').order('created_at', { ascending: true });
    if (error) {
      setMessage(`Could not load workspaces: ${error.message}`);
      return;
    }
    const rows = (data || []) as Workspace[];
    setWorkspaces(rows);
    setWorkspaceId((current) => current || rows[0]?.id || null);
  }

  async function loadWorkspaceData(id: string) {
    if (!supabase) return;
    const [projectRes, taskRes, activityRes, preparedRes] = await Promise.all([
      supabase.from('work_os_projects').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
      supabase.from('work_os_tasks').select('*').eq('workspace_id', id).order('updated_at', { ascending: false }),
      supabase.from('work_os_activity_events').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(80),
      supabase.from('work_os_prepared_work').select('*').eq('workspace_id', id).order('created_at', { ascending: false }),
    ]);
    if (projectRes.error || taskRes.error || activityRes.error || preparedRes.error) {
      setMessage(projectRes.error?.message || taskRes.error?.message || activityRes.error?.message || preparedRes.error?.message || 'Could not load workspace');
      return;
    }
    setProjects((projectRes.data || []) as Project[]);
    setTasks((taskRes.data || []) as WorkTask[]);
    setActivity((activityRes.data || []) as Activity[]);
    setPrepared((preparedRes.data || []) as PreparedWork[]);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthCallbackUrl('/'),
        scopes: 'email profile',
      },
    });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }

  async function createWorkspace() {
    if (!supabase || !user || !workspaceName.trim()) return;
    setBusy(true);
    const newWorkspaceId = crypto.randomUUID();
    const workspace: Workspace = {
      id: newWorkspaceId,
      owner_id: user.id,
      name: workspaceName.trim(),
      company_name: companyName.trim() || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
    };
    const { error } = await supabase
      .from('work_os_workspaces')
      .insert({
        id: workspace.id,
        owner_id: user.id,
        name: workspace.name,
        company_name: workspace.company_name,
        timezone: workspace.timezone,
      });

    if (error) {
      setBusy(false);
      setMessage(`Could not create workspace: ${error.message}`);
      return;
    }

    const { error: memberError } = await supabase.from('work_os_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    if (memberError) {
      setBusy(false);
      setMessage(`Workspace created but membership failed: ${memberError.message}`);
      return;
    }

    await createActivity(workspace.id, null, 'workspace_created', `Created workspace ${workspace.name}`, { company_name: companyName.trim() || null });
    setWorkspaceName('');
    setCompanyName('');
    setBusy(false);
    await loadWorkspaces();
    setWorkspaceId(workspace.id);
  }

  async function createActivity(workspace: string, taskId: string | null, eventType: string, summary: string, payload: Record<string, unknown> = {}, actorType: 'user' | 'sayok' | 'integration' = 'user') {
    if (!supabase) return;
    await supabase.from('work_os_activity_events').insert({
      workspace_id: workspace,
      task_id: taskId,
      actor_type: actorType,
      event_type: eventType,
      summary,
      payload,
    });
  }

  async function patchTask(task: WorkTask, patch: Partial<WorkTask>, eventType: string, summary: string, payload: Record<string, unknown> = {}, actorType: 'user' | 'sayok' | 'integration' = 'user') {
    if (!supabase || !workspaceId) return;
    const { error } = await supabase
      .from('work_os_tasks')
      .update({ ...patch, updated_at: new Date().toISOString(), last_event_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('workspace_id', workspaceId);
    if (error) {
      setMessage(`Could not update task: ${error.message}`);
      return;
    }
    await createActivity(workspaceId, task.id, eventType, summary, { from_status: task.status, to_status: patch.status, ...payload }, actorType);
    await loadWorkspaceData(workspaceId);
  }

  async function deleteTask(task: WorkTask) {
    if (!supabase || !workspaceId) return;
    const confirmed = window.confirm(`Delete "${task.title}"? This removes the task and its activity links.`);
    if (!confirmed) return;
    const { error } = await supabase.from('work_os_tasks').delete().eq('id', task.id).eq('workspace_id', workspaceId);
    if (error) setMessage(`Could not delete task: ${error.message}`);
    await loadWorkspaceData(workspaceId);
  }

  function findLikelyTask(text: string) {
    const person = extractPerson(text)?.toLowerCase();
    const lower = text.toLowerCase();
    const candidates = tasks.filter((task) => !terminalStatuses.includes(task.status));
    if (person) {
      const match = candidates.find((task) => `${task.title} ${task.description || ''} ${task.waiting_for_person || ''}`.toLowerCase().includes(person));
      if (match) return match;
    }
    return candidates.find((task) => lower.split(/\s+/).filter((word) => word.length > 3).some((word) => task.title.toLowerCase().includes(word))) || null;
  }

  async function handleQuickCapture() {
    if (!supabase || !workspaceId || !quickCapture.trim()) return;
    const text = quickCapture.trim();
    const lower = text.toLowerCase();
    const isAlreadyDone = /\balready\b|sent .* elsewhere|messaged|emailed|discussed .* in person|decided not to pursue/.test(lower);
    const candidate = isAlreadyDone ? findLikelyTask(text) : null;
    if (candidate) {
      setAlreadyDoneTask(candidate);
      setAlreadyDoneText(text);
      setAlreadyDoneChannel(/telegram/.test(lower) ? 'Telegram' : /linkedin/.test(lower) ? 'LinkedIn' : /email|gmail/.test(lower) ? 'Email' : /person/.test(lower) ? 'In person' : '');
      setAlreadyDoneWaiting(!/not pursue|cancel|irrelevant|decided not/.test(lower));
      setQuickCapture('');
      return;
    }

    const status: WorkStatus = /waiting on|wait for|waiting for/.test(lower) ? 'waiting_on_someone' : /prepare|draft|proposal/.test(lower) ? 'ready' : 'inbox';
    const waitingForPerson = status === 'waiting_on_someone' ? extractPerson(text) : null;
    const due = inferDueDate(text);
    const { data, error } = await supabase
      .from('work_os_tasks')
      .insert({
        workspace_id: workspaceId,
        title: cleanTitle(text),
        description: text,
        source: 'quick_capture',
        status,
        priority: inferPriority(text),
        due_at: status === 'waiting_on_someone' ? null : due,
        follow_up_at: status === 'waiting_on_someone' ? due : null,
        waiting_for_person: waitingForPerson,
        owner_name: 'Me',
      })
      .select()
      .single();

    if (error || !data) {
      setMessage(`Could not capture work: ${error?.message || 'unknown error'}`);
      return;
    }
    await createActivity(workspaceId, data.id, 'quick_capture_created', `Captured: ${text}`, { raw: text });
    setQuickCapture('');
    await loadWorkspaceData(workspaceId);
  }

  async function confirmAlreadyDone() {
    if (!alreadyDoneTask || !workspaceId) return;
    const now = new Date().toISOString();
    const followUpAt = alreadyDoneWaiting && alreadyDoneFollowUp ? new Date(`${alreadyDoneFollowUp}T09:00:00`).toISOString() : null;
    await patchTask(
      alreadyDoneTask,
      {
        status: alreadyDoneWaiting ? 'waiting_on_someone' : 'done',
        completion_record: {
          happened: alreadyDoneText || 'Already done elsewhere',
          channel: alreadyDoneChannel || 'External channel',
          recorded_at: now,
        },
        follow_up_at: followUpAt,
        due_at: null,
        waiting_for_person: alreadyDoneWaiting ? alreadyDoneTask.waiting_for_person || extractPerson(alreadyDoneText) || 'External person' : null,
      },
      alreadyDoneWaiting ? 'message_sent_elsewhere_waiting' : 'completed_elsewhere',
      alreadyDoneWaiting
        ? `Recorded external completion and moved "${alreadyDoneTask.title}" to Waiting.`
        : `Recorded external completion for "${alreadyDoneTask.title}".`,
      { note: alreadyDoneText, channel: alreadyDoneChannel, follow_up_at: followUpAt },
    );
    setAlreadyDoneTask(null);
    setAlreadyDoneText('');
    setAlreadyDoneChannel('');
    setAlreadyDoneFollowUp('');
    setAlreadyDoneWaiting(true);
  }

  async function createPreparedWork(task: WorkTask) {
    if (!supabase || !workspaceId) return;
    const body = `Subject: Next step on ${task.title}\n\nHi,\n\nFollowing up on this. The useful next step is:\n\n${task.description || task.title}\n\nWould you be open to a short call or a quick reply so we can decide whether to move this forward?\n\nBest,\nYour name`;
    const { data, error } = await supabase
      .from('work_os_prepared_work')
      .insert({
        workspace_id: workspaceId,
        task_id: task.id,
        kind: 'email_draft',
        title: `Draft for ${task.title}`,
        body,
      })
      .select()
      .single();
    if (error || !data) {
      setMessage(`Could not prepare work: ${error?.message || 'unknown error'}`);
      return;
    }
    await patchTask(task, { status: 'prepared_by_sayok', prepared_output: body }, 'prepared_work_created', `SayOK prepared a draft for "${task.title}".`, { prepared_work_id: data.id }, 'sayok');
    setView('prepared');
  }

  async function createProject(name: string, businessArea?: string, clientCompany?: string) {
    if (!supabase || !workspaceId || !name.trim()) return;
    const { data, error } = await supabase
      .from('work_os_projects')
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        business_area: businessArea?.trim() || null,
        client_company: clientCompany?.trim() || null,
        status: 'active',
      })
      .select()
      .single();
    if (error || !data) {
      setMessage(`Could not create project: ${error?.message || 'unknown error'}`);
      return;
    }
    await createActivity(workspaceId, null, 'project_created', `Created project ${data.name}.`, { project_id: data.id });
    await loadWorkspaceData(workspaceId);
  }

  async function convertTaskToProject(task: WorkTask) {
    if (!supabase || !workspaceId) return;
    const { data, error } = await supabase
      .from('work_os_projects')
      .insert({
        workspace_id: workspaceId,
        name: task.title,
        business_area: null,
        client_company: task.client_company,
        status: 'active',
        notes: task.description,
      })
      .select()
      .single();
    if (error || !data) {
      setMessage(`Could not convert task to project: ${error?.message || 'unknown error'}`);
      return;
    }
    await patchTask(task, { project_id: data.id, status: 'in_progress' }, 'task_converted_to_project', `Converted "${task.title}" into a project.`, { project_id: data.id });
  }

  async function mergeDuplicateTask(task: WorkTask) {
    if (!workspaceId) return;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const currentTitle = normalize(task.title);
    const duplicate = activeTasks.find((item) => item.id !== task.id && (normalize(item.title) === currentTitle || normalize(item.title).includes(currentTitle) || currentTitle.includes(normalize(item.title))));
    if (!duplicate) {
      setMessage('No likely duplicate found for this task.');
      return;
    }
    await patchTask(
      task,
      { status: 'archived', user_notes: [task.user_notes, `Merged into: ${duplicate.title}`].filter(Boolean).join('\n') },
      'task_merged_duplicate',
      `Merged duplicate "${task.title}" into "${duplicate.title}".`,
      { merged_into_task_id: duplicate.id },
    );
  }

  const activeTasks = useMemo(() => tasks.filter((task) => !terminalStatuses.includes(task.status)), [tasks]);
  const dueActiveTasks = useMemo(
    () =>
      activeTasks
        .filter((task) => activeStatuses.includes(task.status) && isDueNow(task))
        .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || dateWeight(a.due_at) - dateWeight(b.due_at)),
    [activeTasks],
  );
  const waitingTasks = useMemo(() => activeTasks.filter((task) => task.status === 'waiting_on_someone'), [activeTasks]);
  const waitingReady = useMemo(() => waitingTasks.filter(waitingFollowUpReached), [waitingTasks]);
  const completedToday = useMemo(
    () => tasks.filter((task) => task.status === 'done' && task.updated_at && new Date(task.updated_at).getTime() >= todayStart().getTime()),
    [tasks],
  );
  const filteredTasks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return tasks;
    return tasks.filter((task) => `${task.title} ${task.description || ''} ${task.client_company || ''} ${task.user_notes || ''}`.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  if (authLoading) {
    return <FullScreenMessage title="Loading SayOK" body="Checking your private session." />;
  }

  if (!supabase) {
    return <FullScreenMessage title="Supabase is not configured" body="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using private workspaces." />;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-4 py-10 text-slate-950">
        <section className="mx-auto max-w-xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Private AI work OS</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">SayOK starts in your private workspace.</h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
            Your agent organizes projects, tasks, approvals, prepared work, and activity history after login. Public routes never show private company data or demo customer information.
          </p>
          <button onClick={signInWithGoogle} className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white hover:bg-slate-800">
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  if (!activeWorkspace) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-4 py-10 text-slate-950">
        <section className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Step 1</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Create your private workspace.</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">This workspace is the source of truth for tasks, projects, waiting items, prepared work, and activity history.</p>
          <div className="mt-6 grid gap-3">
            <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Workspace name, e.g. My company" className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-bold outline-none focus:border-orange-400" />
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Company name, optional" className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-bold outline-none focus:border-orange-400" />
            <button disabled={busy || !workspaceName.trim()} onClick={createWorkspace} className="rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white disabled:opacity-40">
              Create workspace
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xl font-black text-orange-600">SayOK</p>
            <p className="text-xs font-bold text-slate-500">Private AI work operating system</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={workspaceId || ''} onChange={(event) => setWorkspaceId(event.target.value)} className="max-w-[220px] rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-black">
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <button onClick={signOut} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-stone-50">
              <LogOut className="inline h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-stone-200 bg-[#fffaf0]">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <textarea
              value={quickCapture}
              onChange={(event) => setQuickCapture(event.target.value)}
              placeholder='Quick capture: "I already messaged Devon on Telegram" or "Follow up with James next Tuesday"'
              className="min-h-[52px] flex-1 resize-y rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400"
            />
            <button onClick={handleQuickCapture} disabled={!quickCapture.trim()} className="rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white disabled:opacity-40">
              Capture / update state
            </button>
          </div>
          {message && <p className="mt-2 text-sm font-bold text-red-700">{message}</p>}
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[230px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="rounded-3xl border border-stone-200 bg-white p-2 shadow-sm">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`mb-1 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-black ${view === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-stone-50'}`}
              >
                {item.label}
                {item.id === 'today' && dueActiveTasks.length > 0 ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">{dueActiveTasks.length}</span> : null}
                {item.id === 'waiting' && waitingTasks.length > 0 ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-slate-700">{waitingTasks.length}</span> : null}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          {view === 'today' && (
            <TodayView
              workspace={activeWorkspace}
              tasks={dueActiveTasks}
              waitingReady={waitingReady}
              waitingTasks={waitingTasks}
              prepared={prepared.filter((item) => item.status === 'prepared')}
              completedToday={completedToday}
              onPatch={patchTask}
              onPrepare={createPreparedWork}
              onAlreadyDone={(task) => setAlreadyDoneTask(task)}
            />
          )}
          {view === 'inbox' && <TaskList title="Inbox" tasks={tasks.filter((task) => task.status === 'inbox' || task.status === 'needs_clarification')} onPatch={patchTask} onPrepare={createPreparedWork} onAlreadyDone={setAlreadyDoneTask} onDelete={deleteTask} onConvert={convertTaskToProject} onMerge={mergeDuplicateTask} />}
          {view === 'tasks' && <TaskList title="All active work" tasks={activeTasks} onPatch={patchTask} onPrepare={createPreparedWork} onAlreadyDone={setAlreadyDoneTask} onDelete={deleteTask} onConvert={convertTaskToProject} onMerge={mergeDuplicateTask} />}
          {view === 'waiting' && <TaskList title="Waiting on others" tasks={waitingTasks} onPatch={patchTask} onPrepare={createPreparedWork} onAlreadyDone={setAlreadyDoneTask} onDelete={deleteTask} onConvert={convertTaskToProject} onMerge={mergeDuplicateTask} />}
          {view === 'prepared' && <PreparedView items={prepared} tasks={tasks} onPatchTask={patchTask} reload={() => workspaceId && loadWorkspaceData(workspaceId)} />}
          {view === 'projects' && <ProjectsView projects={projects} tasks={tasks} onCreate={createProject} />}
          {view === 'calendar' && <Placeholder title="Calendar" body="Google Calendar sync is not connected yet. Calendar will become a real input after OAuth token storage and sync jobs are wired." />}
          {view === 'clients' && <ClientsView tasks={tasks} projects={projects} />}
          {view === 'search' && <SearchView query={searchQuery} setQuery={setSearchQuery} tasks={filteredTasks} activity={activity} />}
          {view === 'activity' && <ActivityView activity={activity} />}
          {view === 'settings' && <SettingsView workspace={activeWorkspace} user={user} />}
        </section>
      </div>

      {alreadyDoneTask && (
        <AlreadyDoneModal
          task={alreadyDoneTask}
          note={alreadyDoneText}
          setNote={setAlreadyDoneText}
          channel={alreadyDoneChannel}
          setChannel={setAlreadyDoneChannel}
          waiting={alreadyDoneWaiting}
          setWaiting={setAlreadyDoneWaiting}
          followUp={alreadyDoneFollowUp}
          setFollowUp={setAlreadyDoneFollowUp}
          onClose={() => setAlreadyDoneTask(null)}
          onConfirm={confirmAlreadyDone}
        />
      )}
    </main>
  );
}

function priorityWeight(priority: Priority) {
  return { low: 0, medium: 1, high: 2, urgent: 3 }[priority];
}

function dateWeight(value: string | null) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function TodayView({
  workspace,
  tasks,
  waitingReady,
  waitingTasks,
  prepared,
  completedToday,
  onPatch,
  onPrepare,
  onAlreadyDone,
}: {
  workspace: Workspace;
  tasks: WorkTask[];
  waitingReady: WorkTask[];
  waitingTasks: WorkTask[];
  prepared: PreparedWork[];
  completedToday: WorkTask[];
  onPatch: (task: WorkTask, patch: Partial<WorkTask>, eventType: string, summary: string, payload?: Record<string, unknown>) => Promise<void>;
  onPrepare: (task: WorkTask) => Promise<void>;
  onAlreadyDone: (task: WorkTask) => void;
}) {
  const doNow = [...waitingReady, ...tasks].slice(0, 5);
  return (
    <div className="space-y-5">
      <Panel>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Daily briefing</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Today in {workspace.name}</h1>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Do now" value={doNow.length} />
          <Metric label="Prepared" value={prepared.length} />
          <Metric label="Waiting" value={waitingTasks.length} />
          <Metric label="Completed today" value={completedToday.length} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-600">
          SayOK only shows work that is active now. Done, cancelled, not relevant, archived, and waiting items before their next review date are removed from active recommendations.
        </p>
      </Panel>

      <Panel>
        <SectionTitle title="Do now" subtitle="Maximum five founder actions that require you now." />
        {doNow.length === 0 ? <EmptyState text="No founder action is due now. Capture new work above or check Waiting." /> : <div className="mt-4 space-y-3">{doNow.map((task) => <TaskRow key={task.id} task={task} onPatch={onPatch} onPrepare={onPrepare} onAlreadyDone={onAlreadyDone} />)}</div>}
      </Panel>

      <Panel>
        <SectionTitle title="Ready for approval" subtitle="Actual deliverables SayOK prepared, not vague task cards." />
        {prepared.length === 0 ? <EmptyState text="No prepared work yet. Use Prepare draft on a task." /> : <PreparedMiniList items={prepared} />}
      </Panel>

      <Panel>
        <SectionTitle title="Waiting on others" subtitle="These are not founder tasks until their follow-up date arrives." />
        {waitingTasks.length === 0 ? <EmptyState text="No waiting items." /> : <div className="mt-4 space-y-2">{waitingTasks.slice(0, 6).map((task) => <WaitingRow key={task.id} task={task} />)}</div>}
      </Panel>

      <Panel>
        <SectionTitle title="Completed today" subtitle="State changes recorded today." />
        {completedToday.length === 0 ? <EmptyState text="Nothing completed today yet." /> : <div className="mt-4 space-y-2">{completedToday.map((task) => <p key={task.id} className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{task.title}</p>)}</div>}
      </Panel>
    </div>
  );
}

function TaskList({
  title,
  tasks,
  onPatch,
  onPrepare,
  onAlreadyDone,
  onDelete,
  onConvert,
  onMerge,
}: {
  title: string;
  tasks: WorkTask[];
  onPatch: (task: WorkTask, patch: Partial<WorkTask>, eventType: string, summary: string, payload?: Record<string, unknown>) => Promise<void>;
  onPrepare: (task: WorkTask) => Promise<void>;
  onAlreadyDone: (task: WorkTask) => void;
  onDelete?: (task: WorkTask) => Promise<void>;
  onConvert?: (task: WorkTask) => Promise<void>;
  onMerge?: (task: WorkTask) => Promise<void>;
}) {
  return (
    <Panel>
      <SectionTitle title={title} subtitle="Every item has one current state. Terminal items disappear from Today." />
      {tasks.length === 0 ? <EmptyState text="No work items in this view." /> : <div className="mt-4 space-y-3">{tasks.map((task) => <TaskRow key={task.id} task={task} onPatch={onPatch} onPrepare={onPrepare} onAlreadyDone={onAlreadyDone} onDelete={onDelete} onConvert={onConvert} onMerge={onMerge} />)}</div>}
    </Panel>
  );
}

function TaskRow({
  task,
  onPatch,
  onPrepare,
  onAlreadyDone,
  onDelete,
  onConvert,
  onMerge,
}: {
  task: WorkTask;
  onPatch: (task: WorkTask, patch: Partial<WorkTask>, eventType: string, summary: string, payload?: Record<string, unknown>) => Promise<void>;
  onPrepare: (task: WorkTask) => Promise<void>;
  onAlreadyDone: (task: WorkTask) => void;
  onDelete?: (task: WorkTask) => Promise<void>;
  onConvert?: (task: WorkTask) => Promise<void>;
  onMerge?: (task: WorkTask) => Promise<void>;
}) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge>{task.status.replaceAll('_', ' ')}</Badge>
            <Badge>{task.priority}</Badge>
            {task.due_at && <Badge>Due {formatDate(task.due_at)}</Badge>}
            {task.follow_up_at && <Badge>Follow up {formatDate(task.follow_up_at)}</Badge>}
          </div>
          <h3 className="mt-3 text-xl font-black">{task.title}</h3>
          {task.description && <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{task.description}</p>}
          <p className="mt-2 text-xs font-bold text-slate-500">
            Owner: {task.owner_name} {task.client_company ? `· Client: ${task.client_company}` : ''} {task.waiting_for_person ? `· Waiting for: ${task.waiting_for_person}` : ''}
          </p>
          {task.prepared_output && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-50 p-3 text-xs font-semibold leading-5 text-slate-700">{task.prepared_output}</pre>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <SmallButton icon={<CheckCircle2 />} label="Mark done" onClick={() => onPatch(task, { status: 'done', completion_record: { completed_at: new Date().toISOString(), method: 'inside_sayok' } }, 'task_done', `Marked "${task.title}" done.`)} />
          <SmallButton icon={<MessageSquarePlus />} label="Already done elsewhere" onClick={() => onAlreadyDone(task)} />
          <SmallButton icon={<Clock3 />} label="Wait for reply" onClick={() => onPatch(task, { status: 'waiting_on_someone', due_at: null, follow_up_at: null }, 'waiting_started', `"${task.title}" is now waiting on someone.`)} />
          <SmallButton icon={<Send />} label="Prepare draft" onClick={() => onPrepare(task)} />
          <SmallButton icon={<UserRoundCheck />} label="Delegate" onClick={() => onPatch(task, { status: 'delegated', owner_name: task.waiting_for_person || 'Delegated' }, 'task_delegated', `Delegated "${task.title}".`)} />
          {onConvert && <SmallButton icon={<Archive />} label="Convert into project" onClick={() => onConvert(task)} />}
          {onMerge && <SmallButton icon={<Archive />} label="Merge duplicate" onClick={() => onMerge(task)} />}
          <SmallButton icon={<XCircle />} label="Not relevant" onClick={() => onPatch(task, { status: 'not_relevant' }, 'task_not_relevant', `Marked "${task.title}" not relevant.`)} />
          <SmallButton icon={<PauseCircle />} label="Cancel" onClick={() => onPatch(task, { status: 'cancelled' }, 'task_cancelled', `Cancelled "${task.title}".`)} />
          {onDelete && <SmallButton icon={<Trash2 />} label="Delete" onClick={() => onDelete(task)} />}
        </div>
      </div>
    </article>
  );
}

function AlreadyDoneModal({
  task,
  note,
  setNote,
  channel,
  setChannel,
  waiting,
  setWaiting,
  followUp,
  setFollowUp,
  onClose,
  onConfirm,
}: {
  task: WorkTask;
  note: string;
  setNote: (value: string) => void;
  channel: string;
  setChannel: (value: string) => void;
  waiting: boolean;
  setWaiting: (value: boolean) => void;
  followUp: string;
  setFollowUp: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Already done elsewhere</p>
        <h2 className="mt-2 text-2xl font-black">{task.title}</h2>
        <div className="mt-5 grid gap-3">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened? e.g. I already messaged Devon on Telegram." className="min-h-[100px] rounded-2xl border border-stone-200 p-3 text-sm font-semibold outline-none focus:border-orange-400" />
          <input value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="Channel, optional: Telegram, Gmail, LinkedIn, in person..." className="rounded-2xl border border-stone-200 p-3 text-sm font-semibold outline-none focus:border-orange-400" />
          <label className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3 text-sm font-black">
            <input type="checkbox" checked={waiting} onChange={(event) => setWaiting(event.target.checked)} />
            We are now waiting on someone else
          </label>
          {waiting && <input type="date" value={followUp} onChange={(event) => setFollowUp(event.target.value)} className="rounded-2xl border border-stone-200 p-3 text-sm font-semibold outline-none focus:border-orange-400" />}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-black">Cancel</button>
          <button onClick={onConfirm} className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white">Update state</button>
        </div>
      </section>
    </div>
  );
}

function PreparedView({ items, tasks, onPatchTask, reload }: { items: PreparedWork[]; tasks: WorkTask[]; onPatchTask: (task: WorkTask, patch: Partial<WorkTask>, eventType: string, summary: string, payload?: Record<string, unknown>) => Promise<void>; reload: () => void }) {
  return (
    <Panel>
      <SectionTitle title="Prepared work" subtitle="Actual outputs created by SayOK." />
      {items.length === 0 ? <EmptyState text="No prepared deliverables yet." /> : (
        <div className="mt-4 space-y-4">
          {items.map((item) => {
            const task = tasks.find((row) => row.id === item.task_id);
            return (
              <article key={item.id} className="rounded-3xl border border-stone-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">{item.kind}</p>
                <h3 className="mt-1 text-xl font-black">{item.title}</h3>
                <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-stone-50 p-4 text-sm font-semibold leading-6 text-slate-700">{item.body}</pre>
                {task && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SmallButton icon={<ShieldCheck />} label="Approve prepared work" onClick={async () => { await onPatchTask(task, { status: 'needs_user_approval' }, 'prepared_work_ready_for_approval', `Prepared work for "${task.title}" is ready for approval.`); reload(); }} />
                    <SmallButton icon={<CheckCircle2 />} label="Mark used" onClick={async () => { await onPatchTask(task, { status: 'done', completion_record: { used_prepared_work: item.id, completed_at: new Date().toISOString() } }, 'prepared_work_used', `Used prepared work for "${task.title}".`); reload(); }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ProjectsView({ projects, tasks, onCreate }: { projects: Project[]; tasks: WorkTask[]; onCreate: (name: string, businessArea?: string, clientCompany?: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [businessArea, setBusinessArea] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  return (
    <Panel>
      <SectionTitle title="Projects" subtitle="Business areas and active responsibility groups." />
      <div className="mt-4 grid gap-2 rounded-3xl border border-stone-200 bg-stone-50 p-4 md:grid-cols-4">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" className="rounded-2xl border border-stone-200 px-3 py-2 text-sm font-bold outline-none focus:border-orange-400 md:col-span-2" />
        <input value={businessArea} onChange={(event) => setBusinessArea(event.target.value)} placeholder="Business area" className="rounded-2xl border border-stone-200 px-3 py-2 text-sm font-bold outline-none focus:border-orange-400" />
        <input value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} placeholder="Client/company" className="rounded-2xl border border-stone-200 px-3 py-2 text-sm font-bold outline-none focus:border-orange-400" />
        <button
          onClick={async () => {
            await onCreate(name, businessArea, clientCompany);
            setName('');
            setBusinessArea('');
            setClientCompany('');
          }}
          disabled={!name.trim()}
          className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40 md:col-span-4"
        >
          Create project
        </button>
      </div>
      {projects.length === 0 ? <EmptyState text="No projects yet. Captured tasks can run without project setup." /> : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <article key={project.id} className="rounded-3xl border border-stone-200 p-4">
              <h3 className="text-xl font-black">{project.name}</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">{project.business_area || 'No business area'} · {project.status}</p>
              <p className="mt-3 text-sm font-semibold text-slate-600">{tasks.filter((task) => task.project_id === project.id && !terminalStatuses.includes(task.status)).length} active tasks</p>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ClientsView({ tasks, projects }: { tasks: WorkTask[]; projects: Project[] }) {
  const clients = Array.from(new Set([...tasks.map((task) => task.client_company), ...projects.map((project) => project.client_company)].filter(Boolean))) as string[];
  return (
    <Panel>
      <SectionTitle title="Clients" subtitle="Client/company view derived from real tasks and projects." />
      {clients.length === 0 ? <EmptyState text="No clients yet. Add client/company names when capturing work." /> : <div className="mt-4 space-y-2">{clients.map((client) => <p key={client} className="rounded-2xl bg-stone-50 px-4 py-3 text-sm font-black">{client}</p>)}</div>}
    </Panel>
  );
}

function SearchView({ query, setQuery, tasks, activity }: { query: string; setQuery: (value: string) => void; tasks: WorkTask[]; activity: Activity[] }) {
  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle title="Search" subtitle="Search active and historical work state." />
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2">
          <Search className="h-5 w-5 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, notes, clients..." className="flex-1 bg-transparent py-2 text-sm font-semibold outline-none" />
        </div>
      </Panel>
      <TaskList title="Search results" tasks={tasks} onPatch={async () => undefined} onPrepare={async () => undefined} onAlreadyDone={() => undefined} />
      <Panel>
        <SectionTitle title="Recent matching activity" subtitle="Activity history is the audit trail." />
        <ActivityList activity={activity.filter((event) => !query || event.summary.toLowerCase().includes(query.toLowerCase())).slice(0, 10)} />
      </Panel>
    </div>
  );
}

function ActivityView({ activity }: { activity: Activity[] }) {
  return (
    <Panel>
      <SectionTitle title="Activity history" subtitle="Every important state change is recorded." />
      <ActivityList activity={activity} />
    </Panel>
  );
}

function ActivityList({ activity }: { activity: Activity[] }) {
  if (activity.length === 0) return <EmptyState text="No activity recorded yet." />;
  return <div className="mt-4 space-y-2">{activity.map((event) => <div key={event.id} className="rounded-2xl bg-stone-50 px-4 py-3"><p className="text-sm font-black">{event.summary}</p><p className="mt-1 text-xs font-bold text-slate-500">{event.event_type} · {formatDateTime(event.created_at)}</p></div>)}</div>;
}

function SettingsView({ workspace, user }: { workspace: Workspace; user: User }) {
  return (
    <Panel>
      <SectionTitle title="Settings" subtitle="Workspace security and integrations." />
      <div className="mt-4 grid gap-3">
        <Info label="Signed in as" value={user.email || user.id} />
        <Info label="Workspace" value={workspace.name} />
        <Info label="Data isolation" value="Every query is scoped by Supabase RLS membership policies." />
        <Info label="Gmail" value="Not connected in this build. Manual capture and external completion keep state current." />
        <Info label="Google Calendar" value="Not connected in this build. Calendar sync job is the next integration step." />
      </div>
    </Panel>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <Panel>
      <SectionTitle title={title} subtitle={body} />
    </Panel>
  );
}

function FullScreenMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-4 text-slate-950">
      <section className="max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{body}</p>
      </section>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">{children}</section>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{subtitle}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black capitalize text-slate-700">{children}</span>;
}

function SmallButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-stone-50">
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="mt-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm font-bold text-slate-500">{text}</p>;
}

function WaitingRow({ task }: { task: WorkTask }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-4 py-3">
      <p className="text-sm font-black">{task.title}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">Waiting for {task.waiting_for_person || 'someone'} · Follow up {formatDate(task.follow_up_at)}</p>
    </div>
  );
}

function PreparedMiniList({ items }: { items: PreparedWork[] }) {
  return <div className="mt-4 space-y-2">{items.slice(0, 5).map((item) => <p key={item.id} className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-orange-800">{item.title}</p>)}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
