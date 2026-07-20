'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Lightbulb,
  MessageSquareText,
  Plus,
  Search,
  UsersRound,
} from 'lucide-react';
import { demoWorkspace } from '@/lib/relationship-os-demo';
import type {
  CaptureExtraction,
  Company,
  Draft,
  NextAction,
  Opportunity,
  OpportunityStage,
  Person,
  RelationshipWorkspace,
} from '@/lib/relationship-os-types';
import {
  buildTodayList,
  draftForOpportunity,
  dueLabel,
  extractCapture,
  formatMoney,
  formatShortDate,
  getCompany,
  getPerson,
  opportunityRisk,
  relationshipScore,
  stages,
  summarizeOpportunity,
  uid,
} from '@/lib/relationship-os-intelligence';

type View = 'today' | 'relationships' | 'opportunities' | 'capture' | 'workspace';
type OpportunityView = 'list' | 'pipeline';

const STORAGE_KEY = 'sayok_relationship_os_v1';

function loadWorkspace(): RelationshipWorkspace {
  if (typeof window === 'undefined') return demoWorkspace;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return demoWorkspace;
    const parsed = JSON.parse(stored) as RelationshipWorkspace;
    if (!parsed.people || !parsed.opportunities || !parsed.actions) return demoWorkspace;
    return parsed;
  } catch {
    return demoWorkspace;
  }
}

function saveWorkspace(workspace: RelationshipWorkspace) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export default function RelationshipOS() {
  const [workspace, setWorkspace] = useState<RelationshipWorkspace>(() => loadWorkspace());
  const [activeView, setActiveView] = useState<View>('today');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('opp-nova-japan-retainer');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    saveWorkspace(workspace);
  }, [workspace]);

  const selectedOpportunity = workspace.opportunities.find((item) => item.id === selectedOpportunityId) ?? workspace.opportunities[0];
  const todayActions = useMemo(() => buildTodayList(workspace), [workspace]);

  function updateWorkspace(next: RelationshipWorkspace) {
    setWorkspace(next);
  }

  function updateAction(id: string, status: NextAction['status']) {
    updateWorkspace({
      ...workspace,
      actions: workspace.actions.map((action) => (action.id === id ? { ...action, status } : action)),
    });
  }

  function snoozeAction(id: string, days = 3) {
    const dueAt = new Date(Date.now() + days * 86400000).toISOString();
    updateWorkspace({
      ...workspace,
      actions: workspace.actions.map((action) => (action.id === id ? { ...action, status: 'snoozed', dueAt } : action)),
    });
  }

  async function createDraft(opportunity: Opportunity) {
    const fallback = draftForOpportunity(workspace, opportunity);
    setDraft(fallback);
    updateWorkspace({ ...workspace, drafts: [fallback, ...workspace.drafts] });
    setSelectedOpportunityId(opportunity.id);
    setActiveView('workspace');

    try {
      const response = await fetch('/api/relationship-os/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity,
          person: getPerson(workspace, opportunity.personId),
          company: getCompany(workspace, opportunity.companyId),
          interactions: workspace.interactions.filter((item) => item.opportunityId === opportunity.id),
        }),
      });
      const data = (await response.json()) as { draft?: { subject?: string; body?: string } };
      if (!response.ok || !data.draft?.body) return;
      const generated = {
        ...fallback,
        subject: data.draft.subject || fallback.subject,
        body: data.draft.body,
      };
      setDraft(generated);
      setWorkspace((current) => ({
        ...current,
        drafts: current.drafts.map((item) => (item.id === fallback.id ? generated : item)),
      }));
    } catch {
      // Keep the deterministic fallback draft.
    }
  }

  function updateOpportunity(id: string, patch: Partial<Opportunity>) {
    updateWorkspace({
      ...workspace,
      opportunities: workspace.opportunities.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      ),
    });
  }

  function addQuickOpportunity(form: FormData) {
    const personName = String(form.get('person') || '').trim();
    const companyName = String(form.get('company') || '').trim();
    const desiredOk = String(form.get('desiredOk') || '').trim();
    const title = String(form.get('title') || '').trim();
    if (!title || !desiredOk) return;

    let companyId: string | undefined;
    let personId: string | undefined;
    const additions: Pick<RelationshipWorkspace, 'companies' | 'people'> = { companies: [], people: [] };

    if (companyName) {
      const existing = workspace.companies.find((company) => company.name.toLowerCase() === companyName.toLowerCase());
      companyId = existing?.id || uid('company');
      if (!existing) {
        additions.companies.push({
          id: companyId,
          name: companyName,
          notes: 'Created from quick opportunity.',
        });
      }
    }

    if (personName) {
      const existing = workspace.people.find((person) => person.name.toLowerCase() === personName.toLowerCase());
      personId = existing?.id || uid('person');
      if (!existing) {
        additions.people.push({
          id: personId,
          name: personName,
          company: companyName,
          companyId,
          relationshipStrength: 'weak',
          tags: ['new'],
          howWeMet: 'Added manually.',
        });
      }
    }

    const opportunity: Opportunity = {
      id: uid('opp'),
      title,
      desiredOk,
      personId,
      companyId,
      stage: 'New',
      probability: 20,
      priority: 'medium',
      nextAction: 'Clarify the next step and decision-maker.',
      nextActionDueAt: new Date().toISOString(),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    updateWorkspace({
      ...workspace,
      companies: [...additions.companies, ...workspace.companies],
      people: [...additions.people, ...workspace.people],
      opportunities: [opportunity, ...workspace.opportunities],
      actions: [
        {
          id: uid('task'),
          title: `Move ${title} to the next OK`,
          dueAt: new Date().toISOString(),
          personId,
          companyId,
          opportunityId: opportunity.id,
          priority: 'medium',
          status: 'open',
          kind: 'ask',
          recommendationReason: 'New opportunity needs one explicit next action.',
        },
        ...workspace.actions,
      ],
    });
    setSelectedOpportunityId(opportunity.id);
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-white">OK</div>
            <div>
              <p className="text-lg font-black leading-none">SayOK</p>
              <p className="hidden text-xs font-semibold text-slate-500 sm:block">From first contact to OK.</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Badge>Relationship OS</Badge>
            <Badge>Founder-led sales</Badge>
          </div>
          <button
            onClick={() => {
              window.localStorage.removeItem(STORAGE_KEY);
              setWorkspace(demoWorkspace);
              setSelectedOpportunityId('opp-nova-japan-retainer');
              setDraft(null);
            }}
            className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-orange-200"
          >
            Reset demo
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <nav className="grid gap-1">
              <NavButton icon={<CalendarDays />} active={activeView === 'today'} onClick={() => setActiveView('today')} label="Today" />
              <NavButton icon={<UsersRound />} active={activeView === 'relationships'} onClick={() => setActiveView('relationships')} label="Relationships" />
              <NavButton icon={<BriefcaseBusiness />} active={activeView === 'opportunities'} onClick={() => setActiveView('opportunities')} label="Opportunities" />
              <NavButton icon={<Plus />} active={activeView === 'capture'} onClick={() => setActiveView('capture')} label="Capture" />
              <NavButton icon={<MessageSquareText />} active={activeView === 'workspace'} onClick={() => setActiveView('workspace')} label="Action workspace" />
            </nav>
          </section>

          <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Daily loop</p>
            <ol className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
              <li>1. Capture context</li>
              <li>2. Define the desired OK</li>
              <li>3. Take one next action</li>
              <li>4. Follow up until OK, lost, or paused</li>
            </ol>
          </section>
        </aside>

        <section className="min-w-0">
          {activeView === 'today' && (
            <TodayView
              workspace={workspace}
              actions={todayActions}
              onDraft={createDraft}
              onDone={(id) => updateAction(id, 'done')}
              onSnooze={snoozeAction}
              onOpen={(id) => {
                setSelectedOpportunityId(id);
                setActiveView('workspace');
              }}
            />
          )}

          {activeView === 'relationships' && (
            <RelationshipsView
              workspace={workspace}
              query={query}
              setQuery={setQuery}
              onOpenOpportunity={(id) => {
                setSelectedOpportunityId(id);
                setActiveView('workspace');
              }}
            />
          )}

          {activeView === 'opportunities' && (
            <OpportunitiesView
              workspace={workspace}
              query={query}
              setQuery={setQuery}
              onDraft={createDraft}
              onOpen={(id) => {
                setSelectedOpportunityId(id);
                setActiveView('workspace');
              }}
              onStageChange={(id, stage) => updateOpportunity(id, { stage })}
              onQuickAdd={addQuickOpportunity}
            />
          )}

          {activeView === 'capture' && <CaptureView workspace={workspace} setWorkspace={updateWorkspace} onOpenWorkspace={() => setActiveView('workspace')} />}

          {activeView === 'workspace' && selectedOpportunity && (
            <ActionWorkspace
              workspace={workspace}
              opportunity={selectedOpportunity}
              draft={draft}
              setDraft={setDraft}
              onDraft={() => createDraft(selectedOpportunity)}
              onUpdateOpportunity={updateOpportunity}
              onDone={(taskId) => updateAction(taskId, 'done')}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-orange-700">{children}</span>;
}

function NavButton({ icon, active, onClick, label }: { icon: React.ReactNode; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black transition ${
        active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-stone-100 hover:text-slate-950'
      }`}
    >
      <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {label}
    </button>
  );
}

function TodayView({
  workspace,
  actions,
  onDraft,
  onDone,
  onSnooze,
  onOpen,
}: {
  workspace: RelationshipWorkspace;
  actions: NextAction[];
  onDraft: (opportunity: Opportunity) => void;
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const activeOpps = workspace.opportunities.filter((opp) => opp.status === 'active');
  const overdue = actions.filter((action) => (daysFromNow(action.dueAt) ?? 1) < 0);
  const noNext = activeOpps.filter((opp) => !opp.nextAction);
  const highPriority = activeOpps.filter((opp) => opp.priority === 'high');

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-orange-700">Good morning.</p>
        <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">Move the right relationships forward today.</h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600">
              SayOK remembers the relationship, the desired OK, the last interaction, and the next action. No CRM ceremony.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Open actions" value={actions.length} />
            <Metric label="High priority" value={highPriority.length} />
            <Metric label="Overdue" value={overdue.length} tone="risk" />
            <Metric label="No next action" value={noNext.length} tone={noNext.length ? 'risk' : 'normal'} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <SectionTitle eyebrow="Today" title="Execution list" />
          <div className="mt-4 space-y-3">
            {actions.map((action) => {
              const opp = workspace.opportunities.find((item) => item.id === action.opportunityId);
              const person = getPerson(workspace, action.personId);
              const company = getCompany(workspace, action.companyId);
              return (
                <article key={action.id} className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={action.priority} />
                        <span className={`text-xs font-black ${daysFromNow(action.dueAt) !== null && (daysFromNow(action.dueAt) ?? 0) < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                          {dueLabel(action.dueAt)}
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-black text-slate-950">{action.title}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        {[person?.name, company?.name, opp?.stage].filter(Boolean).join(' · ')}
                      </p>
                      {action.recommendationReason && <p className="mt-2 text-sm leading-6 text-slate-600">{action.recommendationReason}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {opp && (
                        <button onClick={() => onDraft(opp)} className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white hover:bg-orange-600">
                          Draft
                        </button>
                      )}
                      {opp && (
                        <button onClick={() => onOpen(opp.id)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-stone-50">
                          Open
                        </button>
                      )}
                      <button onClick={() => onDone(action.id)} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50">
                        Done
                      </button>
                      <button onClick={() => onSnooze(action.id)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-stone-50">
                        Snooze
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <InsightCard
            title="Opportunity that needs judgment"
            body="Daniel has weak engagement after repeated follow-ups. Send one close-the-loop message or pause it."
            action="Do not keep chasing weak signal."
          />
          <InsightCard
            title="Highest leverage action"
            body="The event organizer already asked for a sponsor outline. Preparing it has higher odds than more cold outreach."
            action="Prepare proposal today."
          />
          <RecentActivity workspace={workspace} />
        </div>
      </section>
    </div>
  );
}

function RelationshipsView({
  workspace,
  query,
  setQuery,
  onOpenOpportunity,
}: {
  workspace: RelationshipWorkspace;
  query: string;
  setQuery: (value: string) => void;
  onOpenOpportunity: (id: string) => void;
}) {
  const lower = query.toLowerCase();
  const people = workspace.people.filter((person) =>
    [person.name, person.role, person.company, person.email, person.tags.join(' ')].join(' ').toLowerCase().includes(lower),
  );

  return (
    <div className="space-y-5">
      <ListHeader
        eyebrow="Relationships"
        title="People and companies that can move deals"
        copy="Track who they are, when you last spoke, and what needs attention."
        query={query}
        setQuery={setQuery}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {people.map((person) => {
          const company = getCompany(workspace, person.companyId);
          const score = relationshipScore(person, workspace.interactions);
          const opp = workspace.opportunities.find((item) => item.personId === person.id && item.status === 'active');
          return (
            <article key={person.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">{person.name}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">{[person.role, company?.name || person.company].filter(Boolean).join(' · ')}</p>
                </div>
                <StrengthBadge strength={person.relationshipStrength} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <SmallStat label="Score" value={`${score}/100`} />
                <SmallStat label="Last" value={formatShortDate(person.lastInteractionAt)} />
                <SmallStat label="Next" value={dueLabel(person.nextFollowUpAt)} />
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{person.howWeMet || person.notes || 'No relationship history yet.'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {person.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
              {opp && (
                <button onClick={() => onOpenOpportunity(opp.id)} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
                  Open active opportunity <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function OpportunitiesView({
  workspace,
  query,
  setQuery,
  onDraft,
  onOpen,
  onStageChange,
  onQuickAdd,
}: {
  workspace: RelationshipWorkspace;
  query: string;
  setQuery: (value: string) => void;
  onDraft: (opportunity: Opportunity) => void;
  onOpen: (id: string) => void;
  onStageChange: (id: string, stage: OpportunityStage) => void;
  onQuickAdd: (form: FormData) => void;
}) {
  const [view, setView] = useState<OpportunityView>('list');
  const lower = query.toLowerCase();
  const opportunities = workspace.opportunities.filter((opp) =>
    [opp.title, opp.desiredOk, opp.stage, opp.blocker, opp.nextAction].join(' ').toLowerCase().includes(lower),
  );

  return (
    <div className="space-y-5">
      <ListHeader
        eyebrow="Opportunities"
        title="Every opportunity is one desired OK"
        copy="Do not manage a pipeline for its own sake. Track the next action that earns the next OK."
        query={query}
        setQuery={setQuery}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-1">
          <button onClick={() => setView('list')} className={`rounded-xl px-4 py-2 text-sm font-black ${view === 'list' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>
            List
          </button>
          <button onClick={() => setView('pipeline')} className={`rounded-xl px-4 py-2 text-sm font-black ${view === 'pipeline' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>
            Pipeline
          </button>
        </div>
        <QuickAddOpportunity onSubmit={onQuickAdd} />
      </div>

      {view === 'list' ? (
        <div className="grid gap-4">
          {opportunities.map((opp) => (
            <OpportunityCard key={opp.id} workspace={workspace} opportunity={opp} onDraft={onDraft} onOpen={onOpen} onStageChange={onStageChange} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-5">
          {stages
            .filter((stage) => opportunities.some((opp) => opp.stage === stage))
            .map((stage) => (
              <div key={stage} className="min-w-[260px] rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">{stage}</h3>
                <div className="mt-3 space-y-3">
                  {opportunities
                    .filter((opp) => opp.stage === stage)
                    .map((opp) => (
                      <button key={opp.id} onClick={() => onOpen(opp.id)} className="w-full rounded-2xl border border-stone-200 p-3 text-left hover:border-orange-200">
                        <p className="font-black">{opp.title}</p>
                        <p className="mt-2 text-xs font-bold text-slate-500">{dueLabel(opp.nextActionDueAt)}</p>
                      </button>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({
  workspace,
  opportunity,
  onDraft,
  onOpen,
  onStageChange,
}: {
  workspace: RelationshipWorkspace;
  opportunity: Opportunity;
  onDraft: (opportunity: Opportunity) => void;
  onOpen: (id: string) => void;
  onStageChange: (id: string, stage: OpportunityStage) => void;
}) {
  const person = getPerson(workspace, opportunity.personId);
  const company = getCompany(workspace, opportunity.companyId);
  const risk = opportunityRisk(opportunity, workspace.interactions);
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={opportunity.priority} />
            <RiskBadge risk={risk} />
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-slate-600">{opportunity.stage}</span>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight">{opportunity.title}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">{[person?.name, company?.name].filter(Boolean).join(' · ')}</p>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            <span className="font-black">Desired OK:</span> {opportunity.desiredOk}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <span className="font-black">Next:</span> {opportunity.nextAction || 'No next action set.'}
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-4">
          <SmallStat label="Value" value={formatMoney(opportunity.estimatedValue)} />
          <SmallStat label="Probability" value={`${opportunity.probability}%`} />
          <SmallStat label="Due" value={dueLabel(opportunity.nextActionDueAt)} />
          <select
            value={opportunity.stage}
            onChange={(event) => onStageChange(opportunity.id, event.target.value as OpportunityStage)}
            className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => onDraft(opportunity)} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600">
          Draft next message
        </button>
        <button onClick={() => onOpen(opportunity.id)} className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-stone-50">
          Open detail
        </button>
      </div>
    </article>
  );
}

function CaptureView({
  workspace,
  setWorkspace,
  onOpenWorkspace,
}: {
  workspace: RelationshipWorkspace;
  setWorkspace: (workspace: RelationshipWorkspace) => void;
  onOpenWorkspace: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [extraction, setExtraction] = useState<CaptureExtraction | null>(null);

  function saveExtraction() {
    if (!extraction) return;
    const newCompanies = extraction.companies
      .filter((company): company is Company => Boolean(company.id && company.name))
      .map((company) => ({ ...company, id: company.id || uid('company'), name: company.name || 'Untitled company' }));
    const companyId = newCompanies[0]?.id;
    const newPeople = extraction.people
      .filter((person): person is Person => Boolean(person.id && person.name))
      .map((person) => ({
        ...person,
        id: person.id || uid('person'),
        name: person.name || 'Untitled person',
        companyId: person.companyId || companyId,
        relationshipStrength: person.relationshipStrength || 'weak',
        tags: person.tags || ['captured'],
      }));
    const personId = newPeople[0]?.id;
    const opportunity = extraction.opportunity
      ? ({
          ...extraction.opportunity,
          id: extraction.opportunity.id || uid('opp'),
          personId,
          companyId,
          title: extraction.opportunity.title || 'Captured opportunity',
          desiredOk: extraction.opportunity.desiredOk || 'Clarify the next OK.',
          stage: extraction.opportunity.stage || 'New',
          probability: extraction.opportunity.probability || 20,
          priority: extraction.opportunity.priority || 'medium',
          status: extraction.opportunity.status || 'active',
          createdAt: extraction.opportunity.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Opportunity)
      : null;
    const interaction = extraction.interaction
      ? {
          ...extraction.interaction,
          id: extraction.interaction.id || uid('int'),
          date: extraction.interaction.date || new Date().toISOString(),
          type: extraction.interaction.type || 'Note',
          summary: extraction.interaction.summary || raw.slice(0, 260),
          participantIds: personId ? [personId] : [],
          opportunityId: opportunity?.id,
          commitments: extraction.interaction.commitments || [],
          followUpItems: extraction.interaction.followUpItems || [],
        }
      : null;
    const actions = extraction.nextActions.map(
      (action) =>
        ({
          ...action,
          id: action.id || uid('task'),
          personId,
          companyId,
          opportunityId: opportunity?.id,
          title: action.title || 'Review captured follow-up',
          dueAt: action.dueAt || new Date().toISOString(),
          priority: action.priority || 'medium',
          status: 'open',
          kind: action.kind || 'follow_up',
        }) as NextAction,
    );

    setWorkspace({
      ...workspace,
      companies: [...newCompanies, ...workspace.companies],
      people: [...newPeople, ...workspace.people],
      opportunities: opportunity ? [opportunity, ...workspace.opportunities] : workspace.opportunities,
      interactions: interaction ? [interaction, ...workspace.interactions] : workspace.interactions,
      actions: [...actions, ...workspace.actions],
    });
    setRaw('');
    setExtraction(null);
    onOpenWorkspace();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <SectionTitle eyebrow="Fast capture" title="Paste notes, email, chat, or context" />
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Capture first. Clean up later. SayOK extracts people, companies, opportunities, commitments, and the next action.
        </p>
        <textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          className="mt-5 min-h-[300px] w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 outline-none focus:border-orange-400 focus:bg-white"
          placeholder="Example: Met a founder from NovaAI at an event. He is interested in market expansion but unsure about budget. I promised to send a 30-day validation plan and ask for a call next week."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setExtraction(extractCapture(raw))}
            disabled={!raw.trim()}
            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            Extract and review
          </button>
          <button onClick={() => setRaw('')} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-black text-slate-600 hover:bg-stone-50">
            Clear
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <SectionTitle eyebrow="Review" title="Structured context before saving" />
        {!extraction ? (
          <EmptyState title="No extraction yet" copy="Paste context and run extraction. Nothing external happens without your approval." />
        ) : (
          <div className="mt-5 space-y-4">
            <KnownInferredUnknown extraction={extraction} />
            <ReviewBlock title="People" items={extraction.people.map((p) => `${p.name || 'Unknown'}${p.company ? ` · ${p.company}` : ''}`)} />
            <ReviewBlock title="Company" items={extraction.companies.map((c) => `${c.name || 'Unknown'}${c.website ? ` · ${c.website}` : ''}`)} />
            <ReviewBlock title="Opportunity" items={extraction.opportunity ? [String(extraction.opportunity.title), `Desired OK: ${extraction.opportunity.desiredOk}`] : []} />
            <ReviewBlock title="Next action" items={extraction.nextActions.map((a) => `${a.title || 'Review'} · ${dueLabel(a.dueAt)}`)} />
            <button onClick={saveExtraction} className="w-full rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white hover:bg-orange-600">
              Save to SayOK
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ActionWorkspace({
  workspace,
  opportunity,
  draft,
  setDraft,
  onDraft,
  onUpdateOpportunity,
  onDone,
}: {
  workspace: RelationshipWorkspace;
  opportunity: Opportunity;
  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
  onDraft: () => void;
  onUpdateOpportunity: (id: string, patch: Partial<Opportunity>) => void;
  onDone: (id: string) => void;
}) {
  const person = getPerson(workspace, opportunity.personId);
  const company = getCompany(workspace, opportunity.companyId);
  const interactions = workspace.interactions
    .filter((item) => item.opportunityId === opportunity.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const actions = workspace.actions.filter((item) => item.opportunityId === opportunity.id && item.status === 'open');
  const summary = summarizeOpportunity(workspace, opportunity);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge risk={summary.risk} />
              <PriorityBadge priority={opportunity.priority} />
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-slate-600">{opportunity.stage}</span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{opportunity.title}</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">{[person?.name, company?.name].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <SmallStat label="Value" value={formatMoney(opportunity.estimatedValue)} />
            <SmallStat label="Close odds" value={`${opportunity.probability}%`} />
            <SmallStat label="Next due" value={dueLabel(opportunity.nextActionDueAt)} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          <Panel>
            <SectionTitle eyebrow="Situation" title="What matters now" />
            <p className="mt-3 text-base font-semibold leading-7 text-slate-700">{opportunity.summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <TruthList title="Known" items={summary.known} />
              <TruthList title="Inferred" items={summary.inferred} />
              <TruthList title="Unknown" items={summary.unknown} />
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Next recommended action" title={opportunity.nextAction || 'Choose the next action'} />
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Desired OK: <span className="font-black text-slate-900">{opportunity.desiredOk}</span>
            </p>
            {opportunity.blocker && (
              <p className="mt-2 text-sm leading-6 text-red-700">
                Blocker: <span className="font-black">{opportunity.blocker}</span>
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={onDraft} className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600">
                Draft action
              </button>
              <button
                onClick={() => onUpdateOpportunity(opportunity.id, { nextActionDueAt: new Date(Date.now() + 5 * 86400000).toISOString() })}
                className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-stone-50"
              >
                Follow up in 5 days
              </button>
              <button
                onClick={() => onUpdateOpportunity(opportunity.id, { status: 'paused', stage: 'Paused' })}
                className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-stone-50"
              >
                Pause opportunity
              </button>
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Timeline" title="Relationship history" />
            <div className="mt-4 space-y-3">
              {interactions.map((interaction) => (
                <div key={interaction.id} className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black">{interaction.type}</p>
                    <span className="text-xs font-bold text-slate-500">{formatShortDate(interaction.date)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{interaction.summary}</p>
                  {interaction.commitments.length > 0 && <p className="mt-2 text-xs font-bold text-orange-700">Commitments: {interaction.commitments.join(' | ')}</p>}
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <aside className="space-y-5">
          <Panel>
            <SectionTitle eyebrow="Key people" title={person?.name || 'No person assigned'} />
            <p className="mt-2 text-sm font-bold text-slate-500">{[person?.role, company?.name].filter(Boolean).join(' · ')}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{person?.howWeMet || 'No relationship history yet.'}</p>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Open actions" title={`${actions.length} active`} />
            <div className="mt-4 space-y-2">
              {actions.map((action) => (
                <div key={action.id} className="rounded-2xl border border-stone-200 p-3">
                  <p className="text-sm font-black">{action.title}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{dueLabel(action.dueAt)}</p>
                  <button onClick={() => onDone(action.id)} className="mt-3 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700">
                    Mark done
                  </button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Draft" title={draft ? 'Ready to send after review' : 'No draft yet'} />
            {!draft ? (
              <button onClick={onDraft} className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600">
                Generate draft
              </button>
            ) : (
              <div className="mt-4">
                {draft.subject && <p className="rounded-xl bg-stone-50 p-3 text-sm font-black">Subject: {draft.subject}</p>}
                <textarea
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  className="mt-3 min-h-[360px] w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(`${draft.subject ? `Subject: ${draft.subject}\n\n` : ''}${draft.body}`)}
                    className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                  >
                    Copy
                  </button>
                  <button onClick={() => setDraft(null)} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-black text-slate-700">
                    Clear
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function QuickAddOpportunity({ onSubmit }: { onSubmit: (form: FormData) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((value) => !value)} className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600">
        Add opportunity
      </button>
      {open && (
        <form
          action={(form) => {
            onSubmit(form);
            setOpen(false);
          }}
          className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] rounded-3xl border border-stone-200 bg-white p-4 shadow-xl"
        >
          <label className="text-xs font-black uppercase text-slate-500">Title</label>
          <input name="title" required className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 text-sm" placeholder="Japan GTM pilot" />
          <label className="mt-3 block text-xs font-black uppercase text-slate-500">Desired OK</label>
          <textarea name="desiredOk" required className="mt-1 min-h-24 w-full rounded-xl border border-stone-200 px-3 py-3 text-sm" placeholder="Get agreement to a 30-minute call..." />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input name="person" className="rounded-xl border border-stone-200 px-3 py-3 text-sm" placeholder="Person" />
            <input name="company" className="rounded-xl border border-stone-200 px-3 py-3 text-sm" placeholder="Company" />
          </div>
          <button className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Save</button>
        </form>
      )}
    </div>
  );
}

function RecentActivity({ workspace }: { workspace: RelationshipWorkspace }) {
  const recent = [...workspace.interactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
  return (
    <Panel>
      <SectionTitle eyebrow="Recent" title="Latest relationship signals" />
      <div className="mt-4 space-y-3">
        {recent.map((item) => (
          <div key={item.id} className="rounded-2xl bg-stone-50 p-3">
            <p className="text-sm font-black">{item.type}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{formatShortDate(item.date)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ListHeader({
  eyebrow,
  title,
  copy,
  query,
  setQuery,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">{eyebrow}</p>
      <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_340px] lg:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{copy}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm font-semibold" placeholder="Search..." />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'risk' }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'risk' ? 'border-red-100 bg-red-50' : 'border-stone-200 bg-stone-50'}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">{children}</section>;
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const style = priority === 'high' ? 'bg-red-50 text-red-700' : priority === 'medium' ? 'bg-orange-50 text-orange-700' : 'bg-stone-100 text-slate-600';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${style}`}>{priority}</span>;
}

function StrengthBadge({ strength }: { strength: string }) {
  const style = strength === 'strong' ? 'bg-emerald-50 text-emerald-700' : strength === 'warm' ? 'bg-orange-50 text-orange-700' : 'bg-stone-100 text-slate-600';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${style}`}>{strength}</span>;
}

function RiskBadge({ risk }: { risk: string }) {
  const risky = ['overdue', 'stale', 'budget unknown', 'weak signal', 'no next action'].includes(risk);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${risky ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{risk}</span>;
}

function InsightCard({ title, body, action }: { title: string; body: string; action: string }) {
  return (
    <Panel>
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
          <Lightbulb className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          <p className="mt-3 text-sm font-black text-slate-950">{action}</p>
        </div>
      </div>
    </Panel>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
      <p className="font-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p>
    </div>
  );
}

function TruthList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function KnownInferredUnknown({ extraction }: { extraction: CaptureExtraction }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <TruthList title="Known" items={extraction.known} />
      <TruthList title="Inferred" items={extraction.inferred} />
      <TruthList title="Unknown" items={extraction.unknown} />
    </div>
  );
}

function ReviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-stone-200 p-4">
      <p className="text-sm font-black">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing extracted.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function daysFromNow(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startDate - startToday) / 86400000);
}
