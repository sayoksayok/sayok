# SayOK local sales agent

This is the execution path for daily outbound. It does not depend on the SayOK
website, Supabase, Vercel, or the old dashboard.

Each service is a separate campaign. Leads, proof, exclusions, sender identity,
drafts, and sending history are never shared across campaigns.

`searchLanguage` and `searchCountry` are also campaign-specific. For example,
LOOQ searches Japanese sources in Japan while ALTLIER and Own The Doge can use
English-language sources in their own target markets.

## Safety rules

- Publicly listed business emails only. The agent never guesses an address.
- Every email must retain its source URL.
- Existing clients, competitors, previous recipients, and blocked domains are skipped.
- A hard daily cap applies independently to each campaign.
- Dry-run is the default. Sending requires both `enabled: true` and `--live`.
- No attachments, tracking pixels, or mass-mail/BCC behavior.
- Replies and opt-outs must be added to the campaign suppression list.

## Local setup

1. Copy `.env.sales-agent.example` to `.env.sales-agent.local` and add keys.
2. Copy `sales-agent/campaigns.example.json` to
   `sales-agent/private/campaigns.json` and configure each service.
3. Check configuration with `npm run sales-agent:check`.
4. Prepare drafts with `npm run sales-agent:prepare`.
5. Send a single campaign only after review:
   `npm run sales-agent -- --campaign <id> --live`.

Private campaign data and history are ignored by Git.
