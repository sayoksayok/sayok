import type {
  CaptureExtraction,
  Draft,
  Interaction,
  NextAction,
  Opportunity,
  Person,
  RelationshipWorkspace,
} from './relationship-os-types';

export const stages = [
  'New',
  'Researching',
  'Contacted',
  'Replied',
  'Meeting scheduled',
  'Meeting completed',
  'Proposal needed',
  'Proposal sent',
  'Negotiating',
  'Verbal OK',
  'Won',
  'Lost',
  'Paused',
] as const;

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function formatMoney(value?: number) {
  if (!value) return 'No value set';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatShortDate(value?: string) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function daysBetween(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startDate - startToday) / 86400000);
}

export function dueLabel(value?: string) {
  const diff = daysBetween(value);
  if (diff == null) return 'No due date';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff}d`;
}

export function getPerson(workspace: RelationshipWorkspace, id?: string) {
  return workspace.people.find((person) => person.id === id);
}

export function getCompany(workspace: RelationshipWorkspace, id?: string) {
  return workspace.companies.find((company) => company.id === id);
}

export function opportunityRisk(opportunity: Opportunity, interactions: Interaction[]) {
  if (opportunity.status !== 'active') return 'inactive';
  if (!opportunity.nextAction) return 'no next action';
  const due = daysBetween(opportunity.nextActionDueAt);
  if (due != null && due < 0) return 'overdue';
  const last = daysBetween(opportunity.lastInteractionAt);
  if (last != null && last < -14) return 'stale';
  const relatedInteractions = interactions.filter((item) => item.opportunityId === opportunity.id);
  const hasBudgetSignal = [opportunity.notes, opportunity.blocker, ...relatedInteractions.map((item) => item.summary)]
    .join(' ')
    .toLowerCase()
    .includes('budget');
  if (!hasBudgetSignal && opportunity.stage !== 'New' && opportunity.stage !== 'Researching') return 'budget unknown';
  if (opportunity.probability <= 15) return 'weak signal';
  return 'on track';
}

export function relationshipScore(person: Person, interactions: Interaction[]) {
  const related = interactions.filter((item) => item.participantIds.includes(person.id));
  const recency = daysBetween(person.lastInteractionAt);
  let score = person.relationshipStrength === 'strong' ? 45 : person.relationshipStrength === 'warm' ? 30 : 15;
  score += Math.min(related.length * 8, 24);
  if (recency != null && recency >= -7) score += 16;
  if (recency != null && recency < -21) score -= 12;
  if (related.some((item) => item.type === 'Meeting' || item.type === 'Call')) score += 10;
  if (related.some((item) => item.commitments.length > 0)) score += 8;
  return Math.max(0, Math.min(100, score));
}

export function buildTodayList(workspace: RelationshipWorkspace) {
  const openActions = workspace.actions
    .filter((action) => action.status === 'open')
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority] || (daysBetween(a.dueAt) ?? 99) - (daysBetween(b.dueAt) ?? 99);
    });

  const missingNextAction = workspace.opportunities
    .filter((opp) => opp.status === 'active' && !opp.nextAction)
    .map((opp) => ({
      id: `generated-${opp.id}`,
      title: `Choose the next action for ${opp.title}`,
      dueAt: new Date().toISOString(),
      opportunityId: opp.id,
      priority: opp.priority,
      status: 'open',
      kind: 'ask',
      recommendationReason: 'Active opportunity has no owner-visible next action.',
    })) satisfies NextAction[];

  return [...openActions, ...missingNextAction].slice(0, 8);
}

export function draftForOpportunity(workspace: RelationshipWorkspace, opportunity: Opportunity): Draft {
  const person = getPerson(workspace, opportunity.personId);
  const company = getCompany(workspace, opportunity.companyId);
  const interaction = workspace.interactions
    .filter((item) => item.opportunityId === opportunity.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const name = person?.name?.split(' ')[0] || 'there';
  const companyName = company?.name || person?.company || 'your team';
  const blocker = opportunity.blocker ? `The main thing I want to clarify is ${opportunity.blocker.toLowerCase()}` : '';

  let body = `Hi ${name},\n\n`;
  body += interaction
    ? `Good to reconnect after our last conversation about ${interaction.summary.toLowerCase()}\n\n`
    : `I wanted to follow up on ${companyName} and the conversation we started.\n\n`;
  body += `The useful next step seems to be: ${opportunity.desiredOk}\n\n`;
  if (blocker) body += `${blocker}.\n\n`;
  body += `I can prepare a short, practical next step rather than a long deck. Would you be open to a 30-minute call this week to decide whether this is worth moving forward?\n\n`;
  body += `Best,\nYour name`;

  return {
    id: uid('draft'),
    opportunityId: opportunity.id,
    personId: opportunity.personId,
    channel: person?.preferredChannel === 'LinkedIn' ? 'LinkedIn' : 'Email',
    subject: opportunity.stage === 'Proposal needed' ? `Next step for ${companyName}` : `Following up on ${opportunity.title}`,
    body,
    createdAt: new Date().toISOString(),
  };
}

export function summarizeOpportunity(workspace: RelationshipWorkspace, opportunity: Opportunity) {
  const person = getPerson(workspace, opportunity.personId);
  const company = getCompany(workspace, opportunity.companyId);
  const interactions = workspace.interactions
    .filter((item) => item.opportunityId === opportunity.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const risk = opportunityRisk(opportunity, workspace.interactions);
  const known = [
    person ? `Relationship: ${person.name}${company ? ` at ${company.name}` : ''}` : 'Relationship: not assigned',
    `Stage: ${opportunity.stage}`,
    `Desired OK: ${opportunity.desiredOk}`,
    interactions[0] ? `Last interaction: ${interactions[0].summary}` : 'No interaction recorded',
  ];
  const inferred = [
    risk === 'weak signal'
      ? 'This opportunity may not justify more chasing.'
      : risk === 'budget unknown'
        ? 'Budget is still unqualified.'
        : risk === 'overdue'
          ? 'The next action is overdue and should be handled today.'
          : 'There is enough context to take one concrete next step.',
  ];
  const unknown = [
    opportunity.blocker ? opportunity.blocker : 'Decision-maker, timing, and budget may still need confirmation.',
  ];

  return { known, inferred, unknown, risk };
}

export function extractCapture(raw: string): CaptureExtraction {
  const text = raw.trim();
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
  const meetingWords = /met|meeting|call|spoke|talked|intro|conference|event/i.test(text);
  const proposalWords = /proposal|retainer|sponsor|budget|\$|usd|month/i.test(text);
  const followUpWords = /follow up|next week|tomorrow|friday|monday|send|prepare|share|call/i.test(text);
  const nameMatch = text.match(/(?:with|met|intro to|from)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  const companyMatch = text.match(/(?:at|from|for)\s+([A-Z][A-Za-z0-9.&\s-]{2,40})/);

  const personName = nameMatch?.[1]?.replace(/\s+(about|and|to|for)$/i, '').trim();
  const companyName = companyMatch?.[1]?.replace(/\s+(about|and|to|for)$/i, '').trim();
  const opportunityTitle = proposalWords
    ? `Move ${companyName || personName || 'new relationship'} toward a paid OK`
    : `Advance conversation with ${companyName || personName || 'new contact'}`;

  return {
    people: personName
      ? [
          {
            id: uid('person'),
            name: personName,
            email,
            company: companyName,
            relationshipStrength: 'warm',
            howWeMet: meetingWords ? 'Captured from pasted notes.' : undefined,
            tags: ['captured'],
          },
        ]
      : [],
    companies: companyName
      ? [
          {
            id: uid('company'),
            name: companyName,
            website: url,
            notes: 'Captured from pasted notes.',
          },
        ]
      : [],
    opportunity: {
      id: uid('opp'),
      title: opportunityTitle,
      desiredOk: followUpWords ? 'Get agreement on the next concrete step.' : 'Clarify whether there is a real business opportunity.',
      stage: meetingWords ? 'Replied' : 'New',
      probability: proposalWords ? 35 : 20,
      priority: proposalWords ? 'high' : 'medium',
      nextAction: followUpWords ? 'Send a concise follow-up with one clear ask.' : 'Clarify who owns the next step.',
      nextActionDueAt: new Date().toISOString(),
      status: 'active',
      notes: text.slice(0, 800),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    interaction: {
      id: uid('int'),
      date: new Date().toISOString(),
      type: meetingWords ? 'Meeting' : 'Note',
      summary: text.slice(0, 260),
      rawContent: text,
      sentiment: /interested|positive|yes|ok|agreed|happy/i.test(text) ? 'positive' : 'unclear',
      commitments: followUpWords ? ['Prepare or send the next step.'] : [],
      followUpItems: followUpWords ? ['Create follow-up task.'] : [],
    },
    nextActions: [
      {
        id: uid('task'),
        title: followUpWords ? 'Send the follow-up' : 'Define the next action',
        dueAt: new Date().toISOString(),
        priority: proposalWords ? 'high' : 'medium',
        status: 'open',
        kind: followUpWords ? 'follow_up' : 'ask',
        recommendationReason: 'Extracted from pasted notes.',
      },
    ],
    known: [email ? `Email found: ${email}` : 'No email found', url ? `URL found: ${url}` : 'No URL found'].filter(Boolean),
    inferred: [
      meetingWords ? 'This appears to be a relationship or meeting note.' : 'This appears to be a general note.',
      proposalWords ? 'There may be commercial value or a proposal involved.' : 'Commercial value is not yet clear.',
    ],
    unknown: ['Decision-maker', 'Budget', 'Exact follow-up timing'].filter((item) => !text.toLowerCase().includes(item.toLowerCase())),
  };
}
