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

The MVP now requires Supabase Auth and database persistence. Browser localStorage is not used as the source of truth for workspace, task, project, activity, or prepared-work state.

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
- Supabase Auth and database persistence
- Google OAuth for Gmail and Calendar scopes
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

Required for login and persisted Work OS data:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Required for Gmail and Google Calendar integration:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_TOKEN_ENCRYPTION_KEY=
```

Supabase Google OAuth must request these scopes:

```text
email profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/calendar.readonly
```

Required only for subscription pages:

```env
STRIPE_SECRET_KEY=
STRIPE_PRICE_MONTHLY=
STRIPE_PRICE_YEARLY=
STRIPE_WEBHOOK_SECRET=
```

Without valid Supabase and Google OAuth configuration, the app must be treated as a development build. It should not be presented as a production-ready connected agent.

## Database

Existing tables from the previous app:

- `users`
- `translation_history`
- daily usage tables/RPC from `20260405120000_sayok_daily_usage.sql`

New relationship OS migration:

```text
supabase/migrations/20260718090000_relationship_os.sql
```

Legacy execution hierarchy migration:

```text
supabase/migrations/20260720093000_execution_os_hierarchy.sql
```

Current private Work OS foundation migration:

```text
supabase/migrations/20260720161000_work_os_foundation.sql
```

Google integration migration:

```text
supabase/migrations/20260722133000_work_os_google_integrations.sql
```

Run these migrations in Supabase before using the new app. The normal app no longer renders demo work on public routes; users must sign in and create a private workspace.

Current Work OS tables:

- `work_os_workspaces`
- `work_os_members`
- `work_os_projects`
- `work_os_tasks`
- `work_os_activity_events`
- `work_os_prepared_work`
- `work_os_user_profiles`
- `work_os_google_connections`
- `work_os_sync_runs`
- `work_os_external_messages`
- `work_os_calendar_events`

Tenant isolation test:

```bash
npm run test:tenant-isolation
```

This creates two confirmed test users, creates a workspace for User A, verifies User A can read their task, verifies User B cannot read or write Workspace A data, then cleans up. It requires a real Supabase project and service role key.

Core state query:

```sql
-- Founder actions that are active now
select *
from work_os_tasks
where workspace_id = :workspace_id
  and status in (
    'inbox',
    'needs_clarification',
    'ready',
    'in_progress',
    'prepared_by_sayok',
    'needs_user_approval',
    'scheduled',
    'blocked'
  )
  and (due_at is null or due_at <= now() + interval '1 day')
order by
  case priority
    when 'urgent' then 0
    when 'high' then 1
    when 'medium' then 2
    else 3
  end,
  due_at nulls last;
```

Waiting query:

```sql
-- Waiting items should not appear as founder actions until follow-up date
select *
from work_os_tasks
where workspace_id = :workspace_id
  and status = 'waiting_on_someone'
order by follow_up_at nulls last;
```

Audit trail query:

```sql
select *
from work_os_activity_events
where workspace_id = :workspace_id
order by created_at desc;
```

Legacy relationship/execution tables:

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

The legacy tables are kept for compatibility, but the current product experience uses the `work_os_*` tables. Work OS data is workspace-scoped through `work_os_members` and protected by row-level security. No business-data query should run without a workspace scope.

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
