export type RelationshipStrength = 'weak' | 'warm' | 'strong';

export type OpportunityStage =
  | 'New'
  | 'Researching'
  | 'Contacted'
  | 'Replied'
  | 'Meeting scheduled'
  | 'Meeting completed'
  | 'Proposal needed'
  | 'Proposal sent'
  | 'Negotiating'
  | 'Verbal OK'
  | 'Won'
  | 'Lost'
  | 'Paused';

export type OpportunityStatus = 'active' | 'won' | 'lost' | 'paused';

export type InteractionType =
  | 'Email'
  | 'Meeting'
  | 'Call'
  | 'Event conversation'
  | 'LinkedIn message'
  | 'X message'
  | 'Telegram message'
  | 'Discord message'
  | 'WhatsApp message'
  | 'Note'
  | 'Introduction';

export type TaskStatus = 'open' | 'done' | 'snoozed' | 'dismissed';

export type Priority = 'low' | 'medium' | 'high';

export interface Person {
  id: string;
  name: string;
  role?: string;
  companyId?: string;
  company?: string;
  email?: string;
  location?: string;
  preferredChannel?: string;
  relationshipStrength: RelationshipStrength;
  howWeMet?: string;
  lastInteractionAt?: string;
  nextFollowUpAt?: string;
  tags: string[];
  potentialValue?: number;
  mutualContacts?: string[];
  notes?: string;
  socialLinks?: string[];
}

export interface Company {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  stage?: string;
  location?: string;
  description?: string;
  potentialNeed?: string;
  marketRelevance?: string;
  budgetEstimate?: string;
  notes?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  desiredOk: string;
  personId?: string;
  companyId?: string;
  stage: OpportunityStage;
  estimatedValue?: number;
  probability: number;
  priority: Priority;
  nextAction?: string;
  nextActionDueAt?: string;
  lastInteractionAt?: string;
  blocker?: string;
  notes?: string;
  status: OpportunityStatus;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  date: string;
  type: InteractionType;
  summary: string;
  participantIds: string[];
  opportunityId?: string;
  rawContent?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'unclear';
  commitments: string[];
  followUpItems: string[];
}

export interface NextAction {
  id: string;
  title: string;
  dueAt?: string;
  personId?: string;
  companyId?: string;
  opportunityId?: string;
  priority: Priority;
  status: TaskStatus;
  kind:
    | 'draft'
    | 'follow_up'
    | 'proposal'
    | 'meeting_brief'
    | 'ask'
    | 'research'
    | 'pause'
    | 'admin';
  recommendationReason?: string;
}

export interface Draft {
  id: string;
  opportunityId?: string;
  personId?: string;
  channel: 'Email' | 'LinkedIn' | 'WhatsApp' | 'Telegram' | 'Other';
  subject?: string;
  body: string;
  createdAt: string;
}

export interface RelationshipWorkspace {
  people: Person[];
  companies: Company[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: NextAction[];
  drafts: Draft[];
}

export interface CaptureExtraction {
  people: Array<Partial<Person>>;
  companies: Array<Partial<Company>>;
  opportunity?: Partial<Opportunity>;
  interaction?: Partial<Interaction>;
  nextActions: Array<Partial<NextAction>>;
  known: string[];
  inferred: string[];
  unknown: string[];
}
