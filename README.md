# SayOK

見込み客発掘から、会社別の営業メール作成まで。

SayOK is a focused sales agent for founders and small teams. It reads the user's
website, finds organizations and public business contacts, rejects unsafe or
unverifiable addresses, and prepares one editable message per company.

The primary product is available at both `/` and `/new-deal`. Both routes are
private: the application renders the sales workspace only after a valid Supabase
Google login for the configured owner account.

## Product Flow

1. **自社を知る** - Enter one website URL. SayOK extracts the offer, customer
   value, and likely buyers. The user can correct the result.
2. **相手を探す** - Enter a market and sales goal. SayOK searches for real
   organizations and keeps only contacts with public evidence.
3. **文を書く** - Add the sender details once. SayOK creates a company-specific,
   editable message for every accepted contact.
4. **承認して送る** - Review the recipient, public source, subject, and body one
   message at a time. After the owner explicitly confirms, SayOK sends the message
   through the connected Gmail account.

The current workspace and sender profile are stored in the owner's browser.
Starting a new workspace clears the current analysis, leads, and drafts. All
sales-agent API routes independently verify the Supabase bearer session and the
configured owner email; hiding the interface is not the security boundary.

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

The private sales-agent and Gmail sending flow also require:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_TOKEN_ENCRYPTION_KEY=
SALES_AGENT_GOOGLE_REDIRECT_URI=https://www.sayok.chat/api/sales-agent/google/oauth/callback
SALES_AGENT_PRODUCT_SENDERS={"DOGEDAY":"dogejapan@ownthedoge.com","ALTLIER":"dogejapan@ownthedoge.com","LOOQ":"yudai@looq.icu"}
SALES_AGENT_ACCOUNT_DAILY_LIMITS={"dogejapan@ownthedoge.com":20,"yudai@looq.icu":20}
SALES_AGENT_SKIP_DOMAIN_AUTH_CHECK=false
SALES_AGENT_DAILY_SEND_LIMIT=20
```

Apply the existing Work OS migrations and
`20260810160000_sales_agent_multi_sender.sql` to Supabase. Add the
`SALES_AGENT_GOOGLE_REDIRECT_URI` value to the Google OAuth client's authorized
redirect URIs. Connect every sender account from the sender settings panel, then
assign one connected account to each product. A product without an explicit mapping
cannot send.

Database mappings override `SALES_AGENT_PRODUCT_SENDERS`. Per-account database
limits override `SALES_AGENT_ACCOUNT_DAILY_LIMITS`; `SALES_AGENT_DAILY_SEND_LIMIT`
is retained only for legacy single-account connections.

Before every send, SayOK checks the sender domain for Google SPF, the `google` DKIM
selector, and exactly one valid DMARC record. A failed check blocks sending. The
emergency bypass should remain false in production because bypassed mail can damage
the sender domain's reputation. Inspect current DNS results with:

```bash
npm run sales-agent:domain-auth
```

## Safety

- Every Google user receives a separate owner-only sales workspace.
- Gmail tokens, sender settings, drafts, and send history are scoped to the authenticated user.
- Every sender Gmail must be explicitly connected by the current user and mapped to
  the selected product. Another user's connection can never be selected.
- Product mappings have no default-account fallback, so an unmapped product is blocked.
- Daily limits are enforced independently for each connected sender account.
- SPF, DKIM, and DMARC must pass before Gmail sending is allowed.
- The user edits and approves every external message.
- Gmail sending requires a separate, irreversible confirmation click.
- Server routes reject missing confirmation, wrong-account sessions, suppressed
  recipients, duplicate recipients, dummy addresses, and sends above the daily cap.
- OAuth tokens are encrypted at rest and never exposed through a client-readable table.
- Public business-contact evidence is shown next to every accepted address.
- Sender identity, business address, contact details, and an opt-out notice are
  appended to prepared messages.
- Mass email campaigns are out of scope.

## Verification

```bash
npx tsc --noEmit
npx eslint src/components/SalesAgent.tsx src/components/SalesAgentGate.tsx src/app/api/sales-agent
npm run test:sales-domain-auth
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
-> owner confirmation
-> Gmail API send
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
