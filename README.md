# SayOK

From first contact to OK.

SayOK is an execution OS for founders, consultants, agencies, and business developers. It turns workspace context, company data, agents, and approvals into concrete next actions that move real business relationships from first contact to conversation, meeting, proposal, follow-up, agreement, and OK.

This rebuild intentionally moves SayOK away from being a generic AI message rewriter or company-analysis page. The core product loop is now:

1. Capture a person, company, conversation, meeting, or opportunity.
2. Build a concise relationship history.
3. Define the desired OK.
4. Determine the current stage.
5. Recommend one concrete next action.
6. Draft or prepare that action.
7. Track whether it was completed.
8. Remind the user when follow-up is due.
9. Continue until the opportunity is won, lost, or paused.

## Current MVP

The first version is designed for an individual founder or small agency owner, not a large enterprise sales team.

Implemented screens:

- `Today`: daily execution list, overdue actions, risks, and recommended actions.
- `Relationships`: searchable people and companies with relationship strength, last contact, and next action context.
- `Opportunities`: list and lightweight pipeline views around a specific desired OK.
- `Opportunity detail`: current situation, known/inferred/unknown context, next action, draft, timeline, blockers, value, probability.
- `Capture`: paste meeting notes, email text, chat notes, LinkedIn notes, or random context and extract structured relationship data.
- `Action workspace`: draft a follow-up, mark actions done, schedule next follow-up, or pause weak opportunities.

The MVP uses localStorage for a reliable manual workflow and realistic demo data. Supabase tables are included for persistence when auth-backed storage is wired in.

## Product Architecture

SayOK is organized around this hierarchy:

```text
User
↓
Workspace / Organization
↓
Integrations
↓
Company data
↓
Agents
↓
Tasks / Actions / Approvals
```

This is deliberate. The product should not ask the user to re-explain their business every time. A workspace holds the operating context, company data holds the reusable commercial memory, agents prepare work from that context, and approvals keep the human in control before anything external happens.

New MVP surfaces:

- `Workspace`: the operating context for a specific business, brand, or organization.
- `Integrations`: external inputs such as Gmail, Calendar, CSV, and manual capture.
- `Company data`: positioning, offers, proof points, websites, and default signature.
- `Agents`: narrow execution roles with explicit data sources and guardrails.
- `Tasks / Approvals`: the daily execution queue where prepared actions are approved, completed, snoozed, or paused.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth and database foundation
- Anthropic API foundation from the previous app
- Stripe subscription foundation from the previous app

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local` and configure what you need.

Required for AI-backed routes from the previous product:

```env
ANTHROPIC_API_KEY=
```

Required for login and future persisted relationship workspace:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Required only for subscription pages:

```env
STRIPE_SECRET_KEY=
STRIPE_PRICE_MONTHLY=
STRIPE_PRICE_YEARLY=
STRIPE_WEBHOOK_SECRET=
```

The relationship OS MVP can be evaluated without external integrations because it runs from demo data and localStorage.

## Database

Existing tables from the previous app:

- `users`
- `translation_history`
- daily usage tables/RPC from `20260405120000_sayok_daily_usage.sql`

New relationship OS migration:

```text
supabase/migrations/20260718090000_relationship_os.sql
```

New execution hierarchy migration:

```text
supabase/migrations/20260720093000_execution_os_hierarchy.sql
```

New tables:

- `relationship_companies`
- `relationship_people`
- `relationship_opportunities`
- `relationship_interactions`
- `relationship_next_actions`
- `relationship_drafts`
- `sayok_workspaces`
- `sayok_integrations`
- `sayok_company_profiles`
- `sayok_agents`
- `sayok_execution_tasks`

Each table is scoped by `user_id` and protected by row-level security. Useful query examples:

```sql
-- Today's open execution list
select *
from relationship_next_actions
where user_id = auth.uid()
  and status = 'open'
  and (due_at is null or due_at <= now() + interval '1 day')
order by due_at nulls last, priority;
```

```sql
-- Active opportunities with no next action
select *
from relationship_opportunities
where user_id = auth.uid()
  and status = 'active'
  and (next_action is null or length(trim(next_action)) = 0);
```

```sql
-- Relationships needing follow-up
select *
from relationship_people
where user_id = auth.uid()
  and next_follow_up_at <= now()
order by next_follow_up_at;
```

## Product Principles

- Default to action, not analysis.
- One active opportunity should have one clear next action.
- Do not make users maintain a traditional CRM.
- Do not automatically send external messages.
- Clearly distinguish known, inferred, and unknown context.
- Challenge weak opportunities instead of encouraging endless chasing.
- Keep external integrations optional until the internal workflow is useful.

## Non-goals

The first version does not build:

- Mass email campaigns
- Email scraping
- A fully autonomous outbound sales bot
- A generic company research database
- Enterprise CRM customization
- Advanced revenue forecasting
- Complex team permissions
- Marketplace, matching, or payment logic for relationships

## Legacy App

The previous native-expression checker component still exists in `src/components/SayOK.tsx` and the old translation APIs remain available. They are no longer the primary product experience.
