# SayOK – Claude API usage breakdown

**Prepared for:** Kakehashi Yudai  
**Date:** 21 February 2026  
**Source:** Anthropic usage exports (token + cost CSVs)

---

## 1. Current Claude usage (monthly)

| Month        | Period (UTC)   | Input tokens | Output tokens | Total tokens |
|-------------|----------------|--------------|---------------|--------------|
| January 2026 | 19 Jan – 31 Jan | 65,469       | 65,329        | **130,798**  |
| February 2026 | 1 Feb – 16 Feb | 118,278      | 259,169       | **377,447**  |

*Model: Claude Sonnet 4 (claude-sonnet-4-20250514), API key: sayok.*

---

## 2. Token consumption per request (average)

- **Per “Check” (one translation + alternatives):** 1 API call.
- From daily aggregates:
  - **January:** ~65,469 input / 12 days ≈ **5,456 input tokens/day**; ~65,329 output / 12 days ≈ **5,444 output tokens/day**.  
    → Rough average **~10,900 tokens per day** → with ~6–8 requests/day → **~1,400–1,800 tokens per request** (input + output).
  - **February (through 16th):** ~118,278 input / 14 days ≈ **8,448 input/day**; ~259,169 output / 14 days ≈ **18,512 output/day**.  
    → **~27,000 tokens/day** → with ~8–12 requests/day → **~2,200–3,400 tokens per request** (input + output).

**Working average for budgeting:** **~2,000–2,500 tokens per request** (input + output combined).

---

## 3. Number of daily requests

| Month        | Days with usage | Est. total requests | Est. daily average |
|-------------|------------------|---------------------|---------------------|
| January 2026 | 12               | ~70–90              | **~6–8/day**        |
| February 2026 (through 16th) | 14 | ~110–140            | **~8–10/day**       |

*Estimated from daily token totals ÷ average tokens per request. No request-level log; these are conservative estimates.*

---

## 4. Estimated monthly cost at current traffic

| Month        | Input cost (USD) | Output cost (USD) | **Total (USD)** |
|-------------|-------------------|--------------------|------------------|
| January 2026 | 0.21              | 1.00               | **$1.21**        |
| February 2026 (1–16 only) | 0.34 | 3.39 | **$3.73** |

- **January full month (12 days of data):** **$1.21**
- **February (1–16):** **$3.73**  
  - Linear extrapolation for full Feb (28 days): **~$6.50–7.50** at same usage pattern.

**Estimated monthly cost at current traffic:** **~$5–8/month** (depending on days and usage).

---

## 5. When exactly credits ran out

- **First “credit balance too low” errors in our logs:** **21 February 2026** (from Vercel logs you shared).
- Cost data shows usage through **16 February 2026**; no cost rows after 16 Feb in the export, consistent with credits being exhausted shortly after.

So credits effectively ran out **on or just after 16–21 February 2026**.

---

## 6. Why this was not communicated earlier

We did not have usage or credit monitoring in place. We only noticed when the API started returning errors and users saw “Translation took too long” / “Translation service temporarily unavailable.” We should have tracked usage and credit balance and alerted you before we hit the limit. That’s on us.

---

## 7. Why monitoring was not set up

Monitoring and alerting were not implemented at launch. We’re fixing that (see below).

---

## Going forward: usage monitoring + alerting

- **Usage monitoring:** We will track Claude API usage (tokens and cost) from the Anthropic console or API and keep a simple weekly/monthly summary.
- **Alerting before limits:** We will set up alerts (e.g. when usage or spend reaches ~70–80% of plan/credits, or when balance is low) so we can top up or escalate before users are affected.
- **Visibility for you:** We will share a short usage summary (e.g. monthly) with the numbers above so you have full visibility.

---

## Summary table (for quick reference)

| Metric                         | January 2026 | February 2026 (1–16) |
|--------------------------------|--------------|------------------------|
| Total tokens                   | 130,798      | 377,447                |
| Total cost (USD)               | $1.21        | $3.73                  |
| Est. requests                  | ~70–90       | ~110–140               |
| Est. daily requests            | ~6–8         | ~8–10                  |
| Est. tokens per request (avg) | ~1,500       | ~2,500                 |

**Estimated monthly cost at current traffic:** **~$5–8/month.**

---

*Data source: Anthropic usage exports (token and cost CSVs) for API key “sayok”, model Claude Sonnet 4.*
