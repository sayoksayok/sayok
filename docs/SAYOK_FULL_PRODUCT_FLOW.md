# SayOK — Full product flow (master spec)

This document is the **single source of truth** for implementing the client’s **SayOK FULL PRODUCT SPEC**. Every section below maps to their document so nothing is skipped during build.

---

## 0. Product definition (spec §0)

| They say | Implementation note |
|----------|---------------------|
| Pre-send / pre-post rewriting and checking | Primary user journey: paste → improve → copy → send |
| Before: message, social, email, DM, captions | Same UI path; optional future: “context hint” (email vs SNS) if we add explicit field later |
| **NOT** translation-only / grammar-only | Copy + prompts: “communication optimizer,” not “translate” |
| **IS** communication optimizer, context-aware rewriting, global tool | Prompt engineering + output types (`best`, `safe`, `engaging`, …) |
| Core: best version from intent + context + target language | Model must infer intent; target language = user-selected output language |

**Build checkpoint:** Marketing copy, meta description, and in-app strings aligned with “make it better before you send,” not “translation app.”

---

## 1. Core behavior (spec §1)

For **every** input the system must:

| # | Requirement | Flow |
|---|-------------|------|
| 1 | Accept input in **any** language | Client sends raw string; server never rejects on “unknown” input language |
| 2 | Detect language automatically | Model returns `detected_language` (or internal only); **never block** on detection |
| 3 | Infer user intent | Implicit from text (+ optional future: explicit context) |
| 4 | Generate best version | Always produce `best` (primary) |
| 5 | Supporting alternatives | `safe`, `engaging`, optional `sns`, Pro `variations` |

**Outputs (conceptual → strict JSON in §3):**

- Best (PRIMARY)  
- Safe  
- Engaging  
- SNS (conditional)  
- Variations (Pro only)

**Build checkpoint:** One main API path (user-triggered POST) produces the full logical object; **strip fields** per tier before responding to client if we want smaller payloads (spec allows empty `sns` / `variations: []`).

---

## 2. Input / output logic (spec §2)

| Direction | Rule |
|-----------|------|
| Input | Any language, mixed, broken sentences — all allowed |
| Output | **Always** in user-selected target language (output language) |

**Flow:**

```
User types (any) → target dropdown = output_language → API → all strings in that language
```

**Build checkpoint:** Prompt explicitly: “All output fields must be in {output_language}.” No extra “UI language” mixing into generated copy unless we add a separate “explain in UI language” feature (not in spec — skip unless client asks).

---

## 3. API response format — STRICT (spec §3)

**Exact shape (no extra top-level fields in the contract they gave):**

```json
{
  "best": "string",
  "safe": "string",
  "engaging": "string",
  "sns": "string",
  "variations": [
    { "type": "casual", "text": "string" },
    { "type": "emotional", "text": "string" },
    { "type": "professional", "text": "string" }
  ]
}
```

**Rules:**

| Rule | Behavior |
|------|----------|
| No extra fields | Either response matches exactly OR we use an internal DTO and **map** to this shape at the HTTP boundary |
| SNS N/A | `"sns": ""` |
| Not Pro | `"variations": []` |

**Optional internal fields (if we need them):**  
Spec says “no extra fields” — so **`detected_language`** should live in:

- a **wrapper** they did not forbid (only if client agrees), or  
- **response headers**, or  
- **separate internal logging** only  

**Decision for build:** Confirm with client: add `detected_language` as optional 6th field or keep 100% strict and pass detection only in logs/analytics. Until then, **strict JSON only** at the documented contract.

**Flow:**

```
Anthropic returns JSON → validate → map to strict shape → tier filter (strip engaging/sns/variations for free tiers) → HTTP JSON
```

**Build checkpoint:** Zod (or similar) schema for parse + retry on invalid JSON (spec §12).

---

## 4. Language support — CRITICAL (spec §4)

| Topic | Rule |
|-------|------|
| Input | Any language; **do not** block on unknown / not in list |
| Detection | Auto; if uncertain → **still generate** |
| Output | **Only** controlled by user selection |
| Errors | **Never** fail solely because language is “unsupported” |

**UI implication:**

- Target language control = **output** language.  
- Spec says do not rely on **predefined lists for blocking** — we can still show a **dropdown of common targets** for UX, but API must accept edge cases (e.g. “Other” + free text, or pass-through ISO code) if we need true “all languages.”

**Flow (recommended):**

1. Keep dropdown for common targets (fast UX).  
2. Add **“Other”** with text field OR use a searchable language list backed by a large locale table.  
3. Server: if unknown code, pass **language name string** to the model.

**Build checkpoint:** Remove any code path that returns 400 for “unsupported target.”

---

## 5. Output definitions — CRITICAL (spec §5)

### 5.1 Best (PRIMARY)

- Most appropriate for situation; improved; natural; not generic.  
- Tone adapts: DM / email / SNS (implicit from input).

### 5.2 Safe

- Neutral, correct, business-safe, no slang, no emoji.

### 5.3 Engaging

- Shorter or punchier than Safe; clearly different; 0–1 emoji allowed.  
- **Invalid:** minor edits only → **retry** (spec §12).

### 5.4 SNS

- Only when input resembles post or social context.  
- 1–3 sentences, hook, emotional, real-post feel.  
- If SNS ≈ Engaging → **regenerate** (spec §12).  
- Else `"sns": ""`.

### 5.5 Variations (Pro)

- Types: `casual`, `emotional`, `professional` (exactly those `type` values).  
- Clearly different tone + structure; 1–2 sentences each.

**Build checkpoint:** Prompt section per type + automated **similarity check** between safe/engaging and engaging/sns (simple: substring overlap ratio, or LLM judge call — prefer single model pass + self-check instructions first to save cost).

---

## 6. Example (spec §6)

Use their anime example as a **fixture** in tests / manual QA:

- Verify `best`, `safe`, `engaging`, `sns`, and three variation types behave as described.

---

## 7. Free / Pro logic (spec §7)

| State | Limit (per day) | Max chars | API returns (fields populated) |
|-------|-----------------|-----------|--------------------------------|
| Not logged in | **2** | **500** | `best` + `safe` only (`engaging` omitted or empty — spec implies only those two; **clarify:** return empty strings vs omit keys — strict schema has keys; use `""` for hidden tiers or strip in a tiered DTO) |
| Logged in (free) | **5** | **600** | `best` + `safe` + `engaging` |
| Pro | **100** | **2000** | full: `best`, `safe`, `engaging`, `sns`, `variations` |

**Note:** Guest vs signed-in free limits differ (2/500 vs 5/600); server resolves tier from session + DB.

**Flow:**

```
Request → auth/session → resolve tier → enforce char limit → enforce daily limit → call model with tier hint → filter or mask fields → return strict JSON
```

**Build checkpoint:**

- Server-side daily limits via **`sayok_daily_usage`** + RPCs (`sayok_try_consume_check`, `sayok_refund_check`); client no longer owns the count.

---

## 8. Frontend spec (spec §8)

### Rendering order (always)

1. **Best** — PRIMARY, visually highlighted  
2. Safe  
3. Engaging  
4. SNS — only if `sns` non-empty  
5. Variations (Pro) — list of three types  

### Long text

- Container: `max-height: 350px; overflow-y: auto;`  
- Preserve line breaks (`white-space: pre-wrap` or equivalent)  

### Copy

- One copy button **per block**; copies **full** text of that block  

### Expand

- Modal for long content (if truncation in collapsed state — spec asks for modal; implement for very long strings or “read more”)  

### Mobile

- No horizontal overflow; touch-friendly targets  

**Build checkpoint:** `SayOK.tsx` uses the five-block model + variations (legacy history still maps older row shapes).

---

## 9. UI text replacements (spec §9)

| Old (current concept) | New |
|----------------------|-----|
| “Language you typed” | **“Your message”** |
| “See native expressions in” | **“Rewrite into”** |
| Primary CTA | **“Make this better”** |

**Build checkpoint:** Update `src/lib/translations.ts` for all locales (or English-first then sweep).

---

## 10. Language system (spec §10)

```
input_language  = auto_detect(input)   // model / server
output_language = user_selected          // dropdown / other UI
```

**Build checkpoint:** Variable naming in code and prompts matches this mental model.

---

## 11. Prompt structure (spec §11)

- Role: professional native copywriter.  
- Return **JSON only**.  
- Generate: best, safe, engaging; conditional sns; Pro variations.  
- Rules: context-aware tone, non-generic, effectiveness first.

**Build checkpoint:** Single `buildPrompt(tier, outputLang, input)` in API route or `lib/prompts/sayok.ts`.

---

## 12. Fail handling (spec §12)

Retry when:

| Condition | Action |
|-----------|--------|
| JSON invalid | Retry parse / regenerate |
| `best` weak | Retry (define “weak” in prompt or heuristic) |
| engaging ≈ safe | Retry |
| sns ≈ engaging | Retry |
| empty required field | Retry |

**Flow:**

```
Parse → validate semantics → if fail, retry up to N times → if still fail, user-friendly error (not raw model dump)
```

**Build checkpoint:** Cap retries (e.g. 2–3) to control cost; log failures.

---

## 13. API rules (spec §13)

- User-triggered only  
- No background jobs  
- No hidden API calls  

**Build checkpoint:** Audit: no `useEffect` that calls translate without user action; no cron hitting Anthropic.

---

## 14. Priority order (spec §14)

1. Fix UI (critical)  
2. Best output quality  
3. Language robustness  
4. Output differentiation  
5. Usage limits  

Use this as **sprint ordering** when parallel work conflicts.

---

## 15. UI/UX quality — CRITICAL (spec §15)

**Supported:** Mobile iOS/Android, desktop Mac/Windows, Chrome, Safari, Edge, Firefox.

**Must not happen:**

- Unreadable text  
- Copy broken  
- Layout collapse  
- Mobile broken  
- Output overlap / disappear  

**Failure = product fails** (their words) — treat as release checklist before each deploy.

---

## End-to-end user flows (consolidated)

### Flow A — Guest

1. Land on app  
2. Paste message (any language)  
3. Choose output language  
4. Tap **Make this better**  
5. See **Best** (hero) + **Safe**; daily limit 2; max 500 chars  
6. Copy per block  

### Flow B — Logged-in free

1. Sign in  
2. Same as A but limit **5/day**, max **600** chars  
3. See **Best** + **Safe** + **Engaging**  

### Flow C — Pro

1. Subscribed user  
2. Limit **100/day**, max **2000** chars  
3. Full response including **SNS** (if applicable) + **variations**  

### Flow D — Payment

1. Checkout → return URL with session verification (existing)  
2. `users.is_pro` true → Flow C limits  

---

## Implementation checklist (nothing skipped)

Use this as a GitHub issue list or sprint board. **Status as of repo handoff:**

- [x] **§0** Reposition copy & metadata (“optimizer,” not translation-only)  
- [x] **§1–2** Input/output rules in API + prompts  
- [x] **§3** Strict response JSON + validation + tier masking  
- [x] **§4** No language blocking; “Other” output language + custom text  
- [x] **§5** Prompts for best/safe/engaging/sns/variations + similarity checks + SNS blanking when ≈ engaging  
- [ ] **§6** Example as **automated** QA fixture (manual QA still recommended)  
- [x] **§7** Limits: guest 2/500, free 5/600, pro 100/2000 + field visibility + **server-side** consumption (Supabase RPC)  
- [x] **§8** UI order, `max-h` scroll areas, copy buttons, modal for long text  
- [x] **§9** String replacements + CTA (see `translations.ts`; sweep locales as needed)  
- [x] **§10** Naming: prompts use output language; detection via header (see open decisions)  
- [x] **§11** Centralized prompt module: `src/lib/prompts/sayok.ts`  
- [x] **§12** Retry matrix + caps (`MAX_RETRIES` in translate route)  
- [x] **§13** No `useEffect` auto-calls translate — only user-triggered `fetch`  
- [x] **§14** UI prioritized in delivery order  
- [ ] **§15** Cross-browser/device QA checklist (manual before major demos)  

---

## Current codebase vs this doc (snapshot)

| Area | Status |
|------|--------|
| Main API | `src/app/api/translate/route.ts` — strict body `{ best, safe, engaging, sns, variations }`, tier masking, retries |
| UI results | `SayOK.tsx` — five blocks + variations; legacy history rows still map old shapes |
| Limits | Server: `sayok_daily_usage` + RPC when migration applied; guest 2 / free 5 / pro 100 |
| Legacy rewrite API | **Removed** — Pro “full message” path is `best` + stack above; avoids duplicate Anthropic logic |
| Client handoff | `docs/CLIENT_HANDOFF.md` + `MAINNET_SETUP.md` |

---

## Open decisions (resolve before coding edge cases)

1. **Strict JSON:** **Resolved for shipping** — body keeps five keys only; `detected_language` exposed as **`X-SayOK-Detected-Language`** when present.  
2. **Guest/logged free:** Empty strings for disallowed fields in strict body; server strips before response.  
3. **Pronunciation:** Not in strict JSON; optional future with client approval.  
4. **Server-side limits:** **Implemented** in code + SQL migration; **must run** `supabase/migrations/20260405120000_sayok_daily_usage.sql` and set `SUPABASE_SERVICE_ROLE_KEY` in production.  

---

*Document version: 1.1 — checklist synced to implementation handoff.*
