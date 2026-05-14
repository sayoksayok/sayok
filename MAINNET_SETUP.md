# Mainnet setup for https://www.sayok.chat

Use this checklist to configure API keys and URLs for production before deploying.

---

## 1. Vercel (environment variables)

**Where:** [Vercel Dashboard](https://vercel.com/dashboard) → Your project → **Settings** → **Environment Variables**

**What to add:** For **Production** (and optionally Preview), add:

| Name | Value | Notes |
|------|--------|--------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | **Required.** Get from [Anthropic Console](https://console.anthropic.com/). |
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key | Optional. Get from [ElevenLabs API Keys](https://elevenlabs.io/app/settings/api-keys). If missing, app uses browser TTS. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL | e.g. `https://www.sayok.chat` — used for Stripe return URLs and Open Graph `metadataBase`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | e.g. `https://xxxxx.supabase.co` from [Supabase Dashboard](https://supabase.com/dashboard) → Project → Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon (public) key | Same page as URL. Required for login, history, Pro. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** secret | Same API page. **Server only** — never expose to the browser. Required for Stripe webhooks, Pro flag updates, and **server-side daily usage** limits. |
| `SAYOK_USAGE_SALT` | Optional random string | Recommended in production: salt for hashing guest IPs for daily limits. If unset, a fallback is derived from the service role key. |
| `STRIPE_SECRET_KEY` | Stripe secret key | Required for Pro checkout and webhooks. |
| `STRIPE_WEBHOOK_SECRET` | Stripe signing secret | From Stripe Dashboard → Webhooks → your endpoint. |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | Stripe Price IDs | Used by checkout route. |

- Scope: **Production** (and **Preview** if you want staging to work the same).
- After saving, **redeploy** the project so the new variables are used.

---

## 2. Supabase (Auth URL configuration)

**Where:** [Supabase Dashboard](https://supabase.com/dashboard) → Your project → **Authentication** → **URL Configuration**

**Set:**

- **Site URL:** `https://www.sayok.chat`
- **Redirect URLs:** Add (and keep any you need):
  - `https://www.sayok.chat/auth/callback`
  - `http://localhost:3000/auth/callback` (if you still test locally)

Save. This lets Google sign-in redirect back to your live site.

---

## 3. Google Cloud Console (OAuth for “Sign in with Google”)

**Where:** [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → Your **OAuth 2.0 Client ID** (Web application)

**Set:**

- **Authorized JavaScript origins:** Add:
  - `https://www.sayok.chat`
  - `http://localhost:3000` (optional, for local dev)
- **Authorized redirect URIs:** Add:
  - **Supabase callback** (not your app):  
    `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`  
    Example: `https://aorpwukuothnigjfkvqz.supabase.co/auth/v1/callback`

Use the exact Supabase callback URL from Supabase Dashboard → Authentication → URL Configuration or Providers → Google.

---

## 4. Deploy

After the above:

1. Commit and push to the branch Vercel deploys from (e.g. `main`).
2. Vercel will build and deploy; production will use the env vars you set.
3. Test on https://www.sayok.chat:
   - **Make it better** flow (needs `ANTHROPIC_API_KEY`).
   - TTS (uses ElevenLabs if `ELEVENLABS_API_KEY` is set).
   - Sign in with Google (needs Supabase + Google OAuth configured as above).
   - Pro checkout (needs Stripe env vars and webhook URL pointing to `/api/stripe/webhook`).

---

## 5. Server-side daily limits (Supabase)

Daily check limits (guest **2**, free **5**, Pro **100**) are enforced in the **translate API** when Supabase usage RPCs exist.

1. In [Supabase SQL Editor](https://supabase.com/dashboard), run the migration file in this repo:  
   `supabase/migrations/20260405120000_sayok_daily_usage.sql`
2. Ensure **`SUPABASE_SERVICE_ROLE_KEY`** is set on Vercel (Production).  
   Without the migration or service role, the app may **allow extra checks** (fail-open) or skip enforcement.

---

## Quick reference

| Step | Where | What |
|------|--------|------|
| API keys (mainnet) | Vercel → Settings → Environment Variables | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, Supabase URL + anon + **service role**, optional `SAYOK_USAGE_SALT`, Stripe keys + prices |
| Auth redirect (mainnet) | Supabase → Authentication → URL Configuration | Site URL: `https://www.sayok.chat`, Redirect: `https://www.sayok.chat/auth/callback` |
| Google OAuth (mainnet) | Google Cloud Console → Credentials | Origin: `https://www.sayok.chat`, Redirect: Supabase auth callback URL |
| Daily limits SQL | Supabase → SQL Editor | Run `supabase/migrations/20260405120000_sayok_daily_usage.sql` |

Your live site: **https://www.sayok.chat/**

For a short **client-facing** summary (what shipped + checklist), see `docs/CLIENT_HANDOFF.md`.
