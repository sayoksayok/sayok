# SayOK

見込み客発掘から、会社別の営業メール作成まで。

SayOK is a focused sales agent for founders and small teams. It reads the user's
website, finds organizations and public business contacts, rejects unsafe or
unverifiable addresses, and prepares one editable message per company.

The primary product is available at both `/` and `/new-deal`.

## Product Flow

1. **自社を知る** - Enter one website URL. SayOK extracts the offer, customer
   value, and likely buyers. The user can correct the result.
2. **相手を探す** - Enter a market and sales goal. SayOK searches for real
   organizations and keeps only contacts with public evidence.
3. **文を書く** - Add the sender details once. SayOK creates a company-specific,
   editable message for every accepted contact.
4. **承認して送る** - Review one message at a time. SayOK opens a populated Gmail
   compose window only after explicit confirmation. It never sends automatically.

The current workspace and sender profile are stored in the user's browser so the
flow works without the broken legacy login dependency. Starting a new workspace
clears the current analysis, leads, and drafts.

## Contact Quality Rules

The client rejects:

- Missing or malformed email addresses
- Placeholder and disposable-looking addresses
- `noreply` and similar non-receiving mailboxes
- Guessed or `not_found` addresses
- Contacts without a usable public source URL
- Obvious country/domain mismatches

Every accepted result displays the organization source and email source. A
`verified` label is not a substitute for reviewing the linked evidence.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Anthropic for website analysis and personalized drafts
- Brave Search for organization discovery
- Firecrawl for website reading
- Hunter for public email discovery and verification

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Recommended for production-quality sales results:

```env
ANTHROPIC_API_KEY=
BRAVE_SEARCH_API_KEY=
FIRECRAWL_API_KEY=
HUNTER_API_KEY=
```

`APOLLO_API_KEY` is optional. The application can run without these integrations,
but its fallback search and copy are intentionally conservative and should not be
treated as equal to the connected production workflow.

Legacy SayOK routes may still use Supabase, Stripe, ElevenLabs, or Google OAuth.
Those integrations are not required for the main sales-agent flow.

## Safety

- SayOK never sends email automatically.
- Opening Gmail requires a separate confirmation click.
- The user edits and approves all external messages.
- Public business-contact evidence is shown next to every accepted address.
- Sender identity, business address, contact details, and an opt-out notice are
  appended to prepared messages.
- Mass email campaigns are out of scope.

## Verification

```bash
npx tsc --noEmit
npx eslint src/components/SalesAgent.tsx src/app/api/sales-agent
npm run build -- --webpack
```

The repository-wide lint command still reports pre-existing issues in legacy
translation, Stripe, and Work OS files. The active sales-agent files must remain
clean while those older routes are retired separately.

The primary flow should also be tested manually at desktop and mobile widths:

```text
URL analysis
-> lead discovery
-> evidence review
-> sender profile
-> message generation
-> send confirmation
```

## Testnet Escrow Demo

The existing `/new-deal/settlement` route is a separate Mantle Sepolia testnet
demo. It is disabled unless `NEXT_PUBLIC_ESCROW_DEMO=true`. It must never be
connected to the production sales flow or mainnet funds. Any mainnet use requires
an independent third-party security audit first.

## Legacy Code

The previous expression checker, private Work OS experiments, Supabase migrations,
and subscription routes remain in the repository for compatibility. They are not
the current SayOK home experience and should not block the sales-agent workflow.
