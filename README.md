# say ok? - Native Expression Checker

Not translation—real expressions natives actually use.

## Overview

"say ok?" is a language learning tool that helps users choose natural, native-sounding expressions based on context. Instead of just translating, it acts like a bilingual native friend who shows you how natives actually say things.

### Features

- **Multiple expression options**: Safe/Standard, Strong/Direct, Casual, and Soft/Polite
- **9 languages supported**: Japanese, English, Korean, Spanish, Chinese (Simplified & Traditional), French, Thai, Vietnamese
- **Auto-detect input language**
- **Text-to-Speech**: Google Cloud TTS (with browser fallback)
- **Copy to clipboard**
- **Responsive UI**

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **AI**: Anthropic Claude API
- **TTS**: Google Cloud Text-to-Speech (optional)
- **Database**: Supabase (optional, for future features)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Anthropic API key (required)
- Google Cloud API key (optional, for better TTS)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/sayok.git
cd sayok
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` and add your API keys:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key_here  # Optional
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Getting API Keys

### Anthropic API Key (Required)
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy and add to `.env.local`

### Google Cloud TTS API Key (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable "Cloud Text-to-Speech API"
4. Go to Credentials > Create Credentials > API Key
5. Copy and add to `.env.local`

Note: If Google Cloud TTS is not configured, the app will use the browser's built-in speech synthesis.

## Deployment to Vercel

### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Add environment variables:
   - `ANTHROPIC_API_KEY`: Your Anthropic API key
   - `GOOGLE_CLOUD_API_KEY`: Your Google Cloud API key (optional)
5. Deploy

### Option 2: Deploy via CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login and deploy:
```bash
vercel
```

3. Add environment variables:
```bash
vercel env add ANTHROPIC_API_KEY
```

## Lead Discovery Workflow

The `/new-deal` page is a real lead discovery and outreach workflow. A user enters a website URL, target market, and business goal. SayOK uses configured APIs to search for public organizations and contacts, then drafts outreach only when usable contact data is found.

Required production environment variables:

- `BRAVE_SEARCH_API_KEY`: finds public organizations and source pages.
- `FIRECRAWL_API_KEY`: reads and summarizes the user's website.
- `HUNTER_API_KEY`: finds and verifies public email addresses.
- `ANTHROPIC_API_KEY`: analyzes the offer, ranks leads, segments intent, and writes outreach.
- `SUPABASE_SERVICE_ROLE_KEY`: stores server-side intent data and email-gate captures.

Optional:

- `APOLLO_API_KEY`: reserved for contact enrichment when the Apollo plan supports API prospecting.

## Lead Intent Data Foundation

Apply `supabase/migrations/20260612170000_lead_intent_foundation.sql` in Supabase before relying on `/new-deal` data capture.

Core tables:

- `users`: captured Google or email-gate identities, company domain, auth provider, and optional marketing consent.
- `lead_runs`: one row per valid lead-search submission, including raw URL, target market, business goal, referrer, locale, coarse IP country, and run status.
- `run_results`: organizations and contacts found for each run, including role, source URL, and masked email only.
- `run_segments`: LLM-derived structured tags for each run. `japan_market_intent` is an indexed top-level boolean for future marketplace segmentation.

Query runs showing Japan-market intent:

```sql
SELECT
  lr.id,
  lr.created_at,
  lr.input_url,
  lr.target_market,
  lr.business_goal,
  u.email,
  u.company_domain,
  rs.target_region,
  rs.goal_type,
  rs.confidence
FROM public.lead_runs lr
JOIN public.run_segments rs ON rs.run_id = lr.id
LEFT JOIN public.users u ON u.id = lr.user_id
WHERE rs.japan_market_intent = true
ORDER BY lr.created_at DESC;
```

## Mantle Sepolia Escrow Demo

The `/new-deal/settlement` route is a testnet-only outcome escrow demo for matched referrals. It is disabled unless `NEXT_PUBLIC_ESCROW_DEMO=true`.

Safety boundaries:

- The contract is for Mantle Sepolia only.
- Use testnet USDC or a mock ERC20 only.
- Production SayOK is not wired to this contract.
- Users must approve every transaction in MetaMask.
- Mainnet use requires a third-party security audit first.

Deploy the demo contract:

```bash
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz \
ESCROW_ERC20_ADDRESS=0x_your_testnet_usdc_or_mock_erc20 \
DEPLOYER_PRIVATE_KEY=0x_your_testnet_deployer_key \
npm run deploy:escrow:mantle-sepolia
```

The script refuses to deploy unless the connected chain id is `5003`. It writes the deployed address to:

```text
contracts/deployments/mantle-sepolia.json
```

Run the local demo:

```bash
NEXT_PUBLIC_ESCROW_DEMO=true \
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x_deployed_escrow \
NEXT_PUBLIC_ESCROW_TOKEN_ADDRESS=0x_testnet_usdc_or_mock_erc20 \
NEXT_PUBLIC_ESCROW_TOKEN_DECIMALS=6 \
NEXT_PUBLIC_MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz \
npm run dev
```

Apply `supabase/migrations/20260614120000_escrow_settlement_audit.sql` before testing audit persistence. The `escrow_settlement_audits` table stores `referral_id`, `agent_reasoning`, `proposed_amount`, `payee`, `tx_hash`, `status`, and timestamps so the agent decision and on-chain proof stay linked.

## Project Structure

```
sayok/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── translate/    # Translation API (Anthropic)
│   │   │   └── tts/          # Text-to-Speech API (Google Cloud)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── SayOK.tsx         # Main component
│   └── lib/
│       ├── translations.ts    # UI translations (9 languages)
│       └── supabase.ts       # Supabase client (optional)
├── .env.example
├── vercel.json
└── package.json
```

## License

MIT
