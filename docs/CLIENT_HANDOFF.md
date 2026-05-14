# SayOK — Client handoff (release summary)

Use this when sharing the **updated production or preview URL** with the client. Technical setup detail lives in `MAINNET_SETUP.md` at the repo root.

---

## Live URL

- **Production:** https://www.sayok.chat  
- **Preview:** use the Vercel deployment URL for the branch you are sharing.

---

## What this release includes

- **Positioning:** Product copy and site metadata describe SayOK as a **communication optimizer** (improve tone and clarity before send), not a translation-only tool.
- **Outputs:** One main API returns the strict shape: **Best** (primary), **Safe**, **Engaging**, optional **SNS**, and Pro **variations** (casual / emotional / professional).
- **Tiers:** Guest **2** checks/day and **500** characters; signed-in free **5**/**600**; Pro **100**/**2000**. Field visibility matches the spec (guest sees Best + Safe only, and so on).
- **Integrity:** Daily limits are enforced **on the server** (not only in the browser) when Supabase is configured as below.
- **Languages:** Input can be any language; output language is user-selected, including **Other** with a custom label for edge cases.
- **Quality loop:** Invalid JSON and weak differentiation (e.g. engaging too close to safe) trigger **retries** with a capped attempt count.

---

## What you must configure (production)

| Item | Action |
|------|--------|
| Env vars on Vercel | See `MAINNET_SETUP.md` — includes `ANTHROPIC_API_KEY`, Supabase keys (**including `SUPABASE_SERVICE_ROLE_KEY`**), Stripe, optional ElevenLabs. |
| Supabase SQL (one-time) | Run `supabase/migrations/20260405120000_sayok_daily_usage.sql` in the Supabase SQL Editor so daily limits apply. |
| Optional | Set `SAYOK_USAGE_SALT` for stronger guest identity hashing (see `.env.example`). |

If the migration or service role key is missing, the app is designed to **stay usable** but daily limits may not enforce strictly — treat SQL + service role as **required for correct product behavior**.

---

## Detection language (contract note)

The HTTP JSON body stays **strict** (only `best`, `safe`, `engaging`, `sns`, `variations`). When present, detected input language is returned on the response header **`X-SayOK-Detected-Language`** for optional UI or analytics.

---

## Follow-up (not blocking the link)

- **Spend / usage alerts:** Set budgets or notifications in the [Anthropic Console](https://console.anthropic.com/) (and Stripe) so limits are hit gracefully before users see errors.  
- **Cross-device QA:** Before major demos, smoke-test iOS/Android + major browsers per `SAYOK_FULL_PRODUCT_FLOW.md` §15.

---

*Internal doc — adjust URLs if the client uses a different domain.*
