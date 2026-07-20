'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  Link2,
  Mail,
  MessageSquareText,
  Pause,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';

type View = 'today' | 'workspace' | 'integrations' | 'company' | 'agents' | 'approvals';
type TaskStatus = 'needs_approval' | 'approved' | 'done' | 'snoozed' | 'blocked';
type AgentKind = 'follow_up' | 'meeting_prep' | 'proposal' | 'relationship_health' | 'capture';

type Integration = {
  id: string;
  name: string;
  category: string;
  status: 'connected' | 'not_connected' | 'manual';
  description: string;
  nextStep: string;
};

type CompanyProfile = {
  id: string;
  workspaceId: string;
  name: string;
  websites: string[];
  positioning: string;
  offers: string[];
  proof: string[];
  defaultSignature: string;
};

type Agent = {
  id: string;
  kind: AgentKind;
  name: string;
  job: string;
  uses: string[];
  guardrail: string;
  status: 'active' | 'draft';
};

type ExecutionTask = {
  id: string;
  title: string;
  workspaceId: string;
  agentId: string;
  company?: string;
  person?: string;
  desiredOk: string;
  reason: string;
  preparedAction: string;
  due: string;
  priority: 'high' | 'medium' | 'low';
  status: TaskStatus;
  approvalRequired: boolean;
};

type Workspace = {
  id: string;
  name: string;
  role: string;
  operatingContext: string;
  activeGoal: string;
  owner: string;
};

type AppState = {
  user: {
    name: string;
    email: string;
  };
  workspaces: Workspace[];
  activeWorkspaceId: string;
  integrations: Integration[];
  companyProfiles: CompanyProfile[];
  agents: Agent[];
  tasks: ExecutionTask[];
};

const STORAGE_KEY = 'sayok_execution_os_v3';

const demoState: AppState = {
  user: {
    name: 'Guest user',
    email: 'Not signed in',
  },
  activeWorkspaceId: 'ws-demo-agency',
  workspaces: [
    {
      id: 'ws-demo-agency',
      name: 'Demo agency workspace',
      role: 'Founder-led business development',
      operatingContext:
        'Client acquisition, partnerships, event conversations, proposals, and relationship follow-up for a small consulting business.',
      activeGoal: 'Turn warm relationships into meetings, proposals, and signed client work.',
      owner: 'Guest user',
    },
    {
      id: 'ws-demo-partnerships',
      name: 'Demo partnerships workspace',
      role: 'Partnership operator',
      operatingContext: 'Warm introductions, sponsor conversations, community partnerships, and meeting follow-up.',
      activeGoal: 'Keep partnership conversations moving without losing follow-up timing.',
      owner: 'Guest user',
    },
  ],
  integrations: [
    {
      id: 'gmail',
      name: 'Gmail',
      category: 'Email',
      status: 'not_connected',
      description: 'Import sent/replied email context and prepare approved replies.',
      nextStep: 'Connect after internal workflow is stable.',
    },
    {
      id: 'calendar',
      name: 'Google Calendar',
      category: 'Meetings',
      status: 'not_connected',
      description: 'Detect meetings, missing notes, and follow-up commitments.',
      nextStep: 'Connect once workspace context is reliable.',
    },
    {
      id: 'manual-capture',
      name: 'Manual capture',
      category: 'Input',
      status: 'connected',
      description: 'Paste notes, DMs, call summaries, LinkedIn profile text, and event conversations.',
      nextStep: 'Use now.',
    },
    {
      id: 'csv',
      name: 'CSV import',
      category: 'Data',
      status: 'manual',
      description: 'Bring in event attendee lists or relationship spreadsheets.',
      nextStep: 'Prepare a clean import format.',
    },
  ],
  companyProfiles: [
    {
      id: 'profile-demo-agency',
      workspaceId: 'ws-demo-agency',
      name: 'Demo agency',
      websites: ['https://example.com'],
      positioning:
        'A small consulting agency helps technology companies enter new markets through partner development, localized campaigns, events, and founder-led sales support.',
      offers: [
        'Market-entry sprint',
        'Partner outreach',
        'Event and community activation',
        'Proposal and follow-up support',
        'Founder-led sales operations',
      ],
      proof: ['Past consulting work', 'Warm founder network', 'Event operating experience', 'Localized campaign execution'],
      defaultSignature: 'Your name\nFounder, Demo agency',
    },
    {
      id: 'profile-demo-partnerships',
      workspaceId: 'ws-demo-partnerships',
      name: 'Demo partnerships team',
      websites: ['https://example.org'],
      positioning:
        'A lean partnerships team develops warm collaboration opportunities with communities, event organizers, agencies, and strategic partners.',
      offers: ['Partnership intro call', 'Co-marketing concept', 'Sponsor activation package', 'Community collaboration'],
      proof: ['Existing partner relationships', 'Clear event follow-through', 'Fast proposal turnaround'],
      defaultSignature: 'Your name\nPartnerships',
    },
  ],
  agents: [
    {
      id: 'agent-follow-up',
      kind: 'follow_up',
      name: 'Follow-up Agent',
      job: 'Find relationships that need a reply, prepare the next message, and recommend follow-up timing.',
      uses: ['relationship history', 'last interaction', 'desired OK', 'company profile'],
      guardrail: 'Never sends externally without approval.',
      status: 'active',
    },
    {
      id: 'agent-meeting-prep',
      kind: 'meeting_prep',
      name: 'Meeting Prep Agent',
      job: 'Prepare concise briefs before calls and extract commitments after meetings.',
      uses: ['calendar context', 'opportunity stage', 'previous notes'],
      guardrail: 'Labels unknown facts clearly.',
      status: 'active',
    },
    {
      id: 'agent-proposal',
      kind: 'proposal',
      name: 'Proposal Agent',
      job: 'Turn a qualified opportunity into a proposal outline and next-step email.',
      uses: ['offer library', 'proof points', 'blockers', 'budget signals'],
      guardrail: 'Challenges unpaid work and weak budget signals.',
      status: 'active',
    },
    {
      id: 'agent-health',
      kind: 'relationship_health',
      name: 'Relationship Health Agent',
      job: 'Identify stalled, weak, overdue, or over-chased opportunities.',
      uses: ['recency', 'reply signal', 'commitments', 'stage changes'],
      guardrail: 'Can recommend pausing instead of chasing.',
      status: 'active',
    },
  ],
  tasks: [
    {
      id: 'task-partner-followup',
      workspaceId: 'ws-demo-agency',
      agentId: 'agent-follow-up',
      title: 'Send tailored partner follow-up',
      company: 'Example partner company',
      person: 'Partnership lead',
      desiredOk: 'Get agreement to discuss a focused collaboration call.',
      reason: 'Warm intro exists. Generic outreach is weak; this needs concrete collaboration ideas and proof.',
      preparedAction:
        'Send a short email referencing the previous introduction, three specific collaboration angles, and a clear 30-minute meeting ask. Confirm whether this person owns partnerships or can point to the right contact.',
      due: 'Today',
      priority: 'high',
      status: 'needs_approval',
      approvalRequired: true,
    },
    {
      id: 'task-sponsor-proposal',
      workspaceId: 'ws-demo-agency',
      agentId: 'agent-proposal',
      title: 'Prepare sponsor activation proposal',
      company: 'Example event organizer',
      person: 'Event director',
      desiredOk: 'The organizer approves a one-page sponsor activation outline and forwards it to sponsor candidates.',
      reason: 'The organizer asked for a proposal. This is a clear commitment, not a cold lead.',
      preparedAction: 'Draft a one-page proposal with event presence, community activation, creator content, and post-event follow-up.',
      due: 'Today',
      priority: 'high',
      status: 'needs_approval',
      approvalRequired: true,
    },
    {
      id: 'task-community-followup',
      workspaceId: 'ws-demo-partnerships',
      agentId: 'agent-follow-up',
      title: 'Follow up with community program',
      company: 'Example community group',
      person: 'Program coordinator',
      desiredOk: 'Book a short call about a group collaboration.',
      reason: 'For a community audience, the message must mention group value and a clear next step, not a generic service pitch.',
      preparedAction: 'Send a concise email offering a simple group collaboration and a no-pressure intro call.',
      due: 'Tomorrow',
      priority: 'medium',
      status: 'needs_approval',
      approvalRequired: true,
    },
    {
      id: 'task-weak',
      workspaceId: 'ws-demo-agency',
      agentId: 'agent-health',
      title: 'Pause weak opportunity',
      company: 'Unclear prospect',
      person: 'Unqualified contact',
      desiredOk: 'Stop spending time unless a concrete need appears.',
      reason: 'Three follow-ups, no meaningful reply, no decision-maker, no budget, no urgency.',
      preparedAction: 'Send one close-the-loop note or mark paused.',
      due: 'Overdue',
      priority: 'low',
      status: 'blocked',
      approvalRequired: true,
    },
  ],
};

function loadState() {
  if (typeof window === 'undefined') return demoState;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return demoState;
    const parsed = JSON.parse(stored) as AppState;
    if (!parsed.workspaces || !parsed.agents || !parsed.tasks) return demoState;
    return parsed;
  } catch {
    return demoState;
  }
}

function saveState(state: AppState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function SayOKExecutionOS() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [view, setView] = useState<View>('today');
  const [selectedTaskId, setSelectedTaskId] = useState('task-partner-followup');

  useEffect(() => saveState(state), [state]);

  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId) || state.workspaces[0];
  const companyProfile = state.companyProfiles.find((item) => item.workspaceId === workspace.id);
  const workspaceTasks = state.tasks.filter((task) => task.workspaceId === workspace.id);
  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) || workspaceTasks[0] || state.tasks[0];
  const pendingApprovals = workspaceTasks.filter((task) => task.status === 'needs_approval');
  const blockedTasks = workspaceTasks.filter((task) => task.status === 'blocked');

  function updateTask(id: string, patch: Partial<ExecutionTask>) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    }));
  }

  function updateWorkspace(id: string, patch: Partial<Workspace>) {
    setState((current) => ({
      ...current,
      workspaces: current.workspaces.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function updateCompanyProfile(id: string, patch: Partial<CompanyProfile>) {
    setState((current) => ({
      ...current,
      companyProfiles: current.companyProfiles.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function resetDemo() {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(demoState);
    setSelectedTaskId('task-partner-followup');
    setView('today');
  }

  return (
    <main className="min-h-screen bg-[#f6f3ed] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-white">OK</div>
            <div>
              <p className="text-lg font-black leading-none">SayOK</p>
              <p className="hidden text-xs font-bold text-slate-500 sm:block">From first contact to OK.</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <select
              value={state.activeWorkspaceId}
              onChange={(event) => setState((current) => ({ ...current, activeWorkspaceId: event.target.value }))}
              className="max-w-[210px] rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-black outline-none"
            >
              {state.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button onClick={resetDemo} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:border-orange-200">
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-3xl border border-stone-200 bg-white p-3 shadow-sm">
            <NavButton active={view === 'today'} icon={<CalendarClock />} label="Today" onClick={() => setView('today')} count={pendingApprovals.length} />
            <NavButton active={view === 'workspace'} icon={<UsersRound />} label="Workspace" onClick={() => setView('workspace')} />
            <NavButton active={view === 'integrations'} icon={<Link2 />} label="Integrations" onClick={() => setView('integrations')} />
            <NavButton active={view === 'company'} icon={<Database />} label="Company data" onClick={() => setView('company')} />
            <NavButton active={view === 'agents'} icon={<Bot />} label="Agents" onClick={() => setView('agents')} />
            <NavButton active={view === 'approvals'} icon={<ShieldCheck />} label="Approvals" onClick={() => setView('approvals')} count={pendingApprovals.length} />
          </section>

          <section className="mt-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">System shape</p>
            <div className="mt-4 space-y-2 text-sm font-black text-slate-700">
              {['User', 'Workspace', 'Integrations', 'Company data', 'Agents', 'Tasks / Approvals'].map((item, index) => (
                <div key={item}>
                  <div className="rounded-xl bg-stone-50 px-3 py-2">{item}</div>
                  {index < 5 && <ChevronRight className="mx-auto my-1 h-4 w-4 rotate-90 text-slate-300" />}
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          {view === 'today' && (
            <Today
              workspace={workspace}
              profile={companyProfile}
              tasks={workspaceTasks}
              agents={state.agents}
              selectedTask={selectedTask}
              blockedTasks={blockedTasks}
              onSelectTask={(id) => {
                setSelectedTaskId(id);
                setView('approvals');
              }}
              onApprove={(id) => updateTask(id, { status: 'approved' })}
              onDone={(id) => updateTask(id, { status: 'done' })}
              onSnooze={(id) => updateTask(id, { status: 'snoozed', due: 'Next week' })}
            />
          )}
          {view === 'workspace' && <WorkspaceView workspace={workspace} user={state.user} onUpdate={(patch) => updateWorkspace(workspace.id, patch)} />}
          {view === 'integrations' && <IntegrationsView integrations={state.integrations} />}
          {view === 'company' && companyProfile && <CompanyDataView profile={companyProfile} onUpdate={(patch) => updateCompanyProfile(companyProfile.id, patch)} />}
          {view === 'agents' && <AgentsView agents={state.agents} />}
          {view === 'approvals' && (
            <ApprovalsView
              workspace={workspace}
              tasks={workspaceTasks}
              agents={state.agents}
              selectedTask={selectedTask}
              setSelectedTaskId={setSelectedTaskId}
              onApprove={(id) => updateTask(id, { status: 'approved' })}
              onDone={(id) => updateTask(id, { status: 'done' })}
              onPause={(id) => updateTask(id, { status: 'blocked' })}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`mb-1 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-black transition ${
        active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-stone-100 hover:text-slate-950'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        {label}
      </span>
      {count ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">{count}</span> : null}
    </button>
  );
}

function Today({
  workspace,
  profile,
  tasks,
  agents,
  selectedTask,
  blockedTasks,
  onSelectTask,
  onApprove,
  onDone,
  onSnooze,
}: {
  workspace: Workspace;
  profile?: CompanyProfile;
  tasks: ExecutionTask[];
  agents: Agent[];
  selectedTask: ExecutionTask;
  blockedTasks: ExecutionTask[];
  onSelectTask: (id: string) => void;
  onApprove: (id: string) => void;
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  const approvals = tasks.filter((task) => task.status === 'needs_approval');
  const done = tasks.filter((task) => task.status === 'done');
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-black text-orange-700">Today in {workspace.name}</p>
        <div className="mt-3 grid gap-5 xl:grid-cols-[1fr_360px]">
          <div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">Earn the next OK.</h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">{workspace.activeGoal}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Approvals" value={approvals.length} tone="orange" />
            <Metric label="Blocked" value={blockedTasks.length} tone={blockedTasks.length ? 'red' : 'plain'} />
            <Metric label="Done" value={done.length} tone="green" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <SectionTitle eyebrow="Tasks / Actions / Approvals" title="Execution queue" />
          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} agent={agents.find((agent) => agent.id === task.agentId)} onSelect={onSelectTask} onApprove={onApprove} onDone={onDone} onSnooze={onSnooze} />
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <Panel>
            <SectionTitle eyebrow="Selected action" title={selectedTask.title} />
            <p className="mt-3 text-sm leading-6 text-slate-600">{selectedTask.reason}</p>
            <div className="mt-4 rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Prepared action</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{selectedTask.preparedAction}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton icon={<Check />} label="Approve" onClick={() => onApprove(selectedTask.id)} />
              <ActionButton icon={<Send />} label="Mark done" onClick={() => onDone(selectedTask.id)} variant="dark" />
              <ActionButton icon={<Pause />} label="Snooze" onClick={() => onSnooze(selectedTask.id)} variant="light" />
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Company memory" title={profile?.name || 'No profile'} />
            <p className="mt-3 text-sm leading-6 text-slate-600">{profile?.positioning}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {profile?.offers.slice(0, 3).map((offer) => (
                <span key={offer} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                  {offer}
                </span>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function WorkspaceView({ workspace, user, onUpdate }: { workspace: Workspace; user: AppState['user']; onUpdate: (patch: Partial<Workspace>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Panel>
        <SectionTitle eyebrow="User → Workspace / Organization" title={workspace.name} />
        <div className="mt-5 grid gap-4">
          <Field label="Workspace name" value={workspace.name} onChange={(value) => onUpdate({ name: value })} />
          <Field label="Your role in this workspace" value={workspace.role} onChange={(value) => onUpdate({ role: value })} />
          <TextField label="Operating context" value={workspace.operatingContext} onChange={(value) => onUpdate({ operatingContext: value })} />
          <TextField label="Active business goal" value={workspace.activeGoal} onChange={(value) => onUpdate({ activeGoal: value })} />
        </div>
      </Panel>
      <Panel>
        <SectionTitle eyebrow="User" title={user.name} />
        <p className="mt-2 text-sm font-bold text-slate-500">{user.email}</p>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          The user owns approvals. Agents can prepare actions, update internal summaries, and recommend timing. External actions require explicit confirmation.
        </p>
      </Panel>
    </div>
  );
}

function IntegrationsView({ integrations }: { integrations: Integration[] }) {
  return (
    <div className="space-y-5">
      <Hero eyebrow="Integrations" title="External systems are inputs, not the product." copy="Manual capture works now. Gmail, Calendar, Contacts, and CSV become reliable inputs after the internal execution loop is useful." />
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Panel key={integration.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">{integration.category}</p>
                <h2 className="mt-1 text-2xl font-black">{integration.name}</h2>
              </div>
              <StatusBadge status={integration.status} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{integration.description}</p>
            <p className="mt-4 rounded-2xl bg-stone-50 p-3 text-sm font-black text-slate-700">{integration.nextStep}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function CompanyDataView({ profile, onUpdate }: { profile: CompanyProfile; onUpdate: (patch: Partial<CompanyProfile>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Panel>
        <SectionTitle eyebrow="Company data" title={profile.name} />
        <div className="mt-5 grid gap-4">
          <Field label="Company / sending profile" value={profile.name} onChange={(value) => onUpdate({ name: value })} />
          <TextField label="Positioning" value={profile.positioning} onChange={(value) => onUpdate({ positioning: value })} />
          <TextField label="Default signature" value={profile.defaultSignature} onChange={(value) => onUpdate({ defaultSignature: value })} />
        </div>
      </Panel>
      <div className="space-y-5">
        <EditableList title="Offers" items={profile.offers} onChange={(offers) => onUpdate({ offers })} />
        <EditableList title="Proof points" items={profile.proof} onChange={(proof) => onUpdate({ proof })} />
        <EditableList title="Websites" items={profile.websites} onChange={(websites) => onUpdate({ websites })} />
      </div>
    </div>
  );
}

function AgentsView({ agents }: { agents: Agent[] }) {
  return (
    <div className="space-y-5">
      <Hero eyebrow="Agents" title="Agents prepare work. Humans approve outcomes." copy="Each agent has a narrow job, clear data sources, and explicit guardrails. No autonomous sending." />
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <Panel key={agent.id}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-700">{agent.status}</p>
                <h2 className="text-2xl font-black">{agent.name}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{agent.job}</p>
            <div className="mt-4 rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Uses</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{agent.uses.join(', ')}</p>
            </div>
            <p className="mt-4 text-sm font-black text-slate-900">Guardrail: {agent.guardrail}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ApprovalsView({
  workspace,
  tasks,
  agents,
  selectedTask,
  setSelectedTaskId,
  onApprove,
  onDone,
  onPause,
}: {
  workspace: Workspace;
  tasks: ExecutionTask[];
  agents: Agent[];
  selectedTask: ExecutionTask;
  setSelectedTaskId: (id: string) => void;
  onApprove: (id: string) => void;
  onDone: (id: string) => void;
  onPause: (id: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Panel>
        <SectionTitle eyebrow="Approval queue" title={workspace.name} />
        <div className="mt-4 space-y-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className={`w-full rounded-2xl border p-3 text-left ${selectedTask.id === task.id ? 'border-orange-300 bg-orange-50' : 'border-stone-200 hover:bg-stone-50'}`}
            >
              <p className="text-sm font-black">{task.title}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{task.company} · {task.due}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <StatusBadge status={selectedTask.status} />
            <h1 className="mt-3 text-3xl font-black tracking-tight">{selectedTask.title}</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">{selectedTask.person} · {selectedTask.company}</p>
          </div>
          <PriorityBadge priority={selectedTask.priority} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <InfoBlock title="Desired OK" body={selectedTask.desiredOk} />
          <InfoBlock title="Why now" body={selectedTask.reason} />
        </div>
        <div className="mt-5 rounded-3xl bg-stone-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Prepared by {agents.find((agent) => agent.id === selectedTask.agentId)?.name}</p>
          <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-800">{selectedTask.preparedAction}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <ActionButton icon={<ShieldCheck />} label="Approve action" onClick={() => onApprove(selectedTask.id)} />
          <ActionButton icon={<Check />} label="Mark completed" onClick={() => onDone(selectedTask.id)} variant="dark" />
          <ActionButton icon={<Pause />} label="Pause / block" onClick={() => onPause(selectedTask.id)} variant="light" />
        </div>
      </Panel>
    </div>
  );
}

function TaskCard({
  task,
  agent,
  onSelect,
  onApprove,
  onDone,
  onSnooze,
}: {
  task: ExecutionTask;
  agent?: Agent;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  return (
    <article className="rounded-3xl border border-stone-200 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-slate-600">{task.due}</span>
          </div>
          <h3 className="mt-3 text-xl font-black">{task.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{[task.person, task.company, agent?.name].filter(Boolean).join(' · ')}</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{task.reason}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={() => onSelect(task.id)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-stone-50">
            Review
          </button>
          <button onClick={() => onApprove(task.id)} className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white hover:bg-orange-600">
            Approve
          </button>
          <button onClick={() => onDone(task.id)} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50">
            Done
          </button>
          <button onClick={() => onSnooze(task.id)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-stone-50">
            Snooze
          </button>
        </div>
      </div>
    </article>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">{children}</section>;
}

function Hero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <Panel>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">{eyebrow}</p>
      <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-tight">{title}</h1>
      <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">{copy}</p>
    </Panel>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'orange' | 'green' | 'red' | 'plain' }) {
  const style = tone === 'orange' ? 'border-orange-100 bg-orange-50' : tone === 'green' ? 'border-emerald-100 bg-emerald-50' : tone === 'red' ? 'border-red-100 bg-red-50' : 'border-stone-200 bg-stone-50';
  return (
    <div className={`rounded-2xl border p-4 ${style}`}>
      <p className="text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: ExecutionTask['priority'] }) {
  const style = priority === 'high' ? 'bg-red-50 text-red-700' : priority === 'medium' ? 'bg-orange-50 text-orange-700' : 'bg-stone-100 text-slate-600';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${style}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === 'connected' || status === 'approved' || status === 'done'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'needs_approval' || status === 'manual'
        ? 'bg-orange-50 text-orange-700'
        : status === 'blocked' || status === 'not_connected'
          ? 'bg-red-50 text-red-700'
          : 'bg-stone-100 text-slate-600';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${style}`}>{status.replace(/_/g, ' ')}</span>;
}

function ActionButton({ icon, label, onClick, variant = 'orange' }: { icon: React.ReactNode; label: string; onClick: () => void; variant?: 'orange' | 'dark' | 'light' }) {
  const style = variant === 'dark' ? 'bg-slate-950 text-white hover:bg-slate-800' : variant === 'light' ? 'border border-stone-200 bg-white text-slate-700 hover:bg-stone-50' : 'bg-orange-500 text-white hover:bg-orange-600';
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${style}`}>
      <span className="h-4 w-4 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{body}</p>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400 focus:bg-white" />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-orange-400 focus:bg-white" />
    </label>
  );
}

function EditableList({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <Panel>
      <SectionTitle eyebrow="Memory" title={title} />
      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-center gap-2 rounded-2xl bg-stone-50 p-3">
            <p className="flex-1 text-sm font-semibold text-slate-700">{item}</p>
            <button onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-xs font-black text-red-600">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold" placeholder={`Add ${title.toLowerCase()}`} />
        <button
          onClick={() => {
            if (!draft.trim()) return;
            onChange([...items, draft.trim()]);
            setDraft('');
          }}
          className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white"
        >
          Add
        </button>
      </div>
    </Panel>
  );
}
