/** Tier for SayOK model prompts (matches translate API). */
export type SayOkPromptTier = 'guest' | 'free' | 'pro';

/**
 * Builds the user message for Claude: strict JSON, communication-optimizer role, tier-specific fields.
 * @see docs/SAYOK_FULL_PRODUCT_FLOW.md §11
 */
export function buildSayokPrompt(tier: SayOkPromptTier, outputLang: string, inputText: string): string {
  const base = `You are a professional native copywriter and communication optimizer.
This is NOT a grammar-only tool and NOT "translation app" copy — you improve how the message lands.

OUTPUT LANGUAGE (write EVERY string value in this language only): ${outputLang}

USER INPUT (any language, may be mixed, informal, or broken — still process it):
---
${inputText}
---

Also set "detected_language" to a short English name for the main language of the input (guess if unsure — never refuse).

Return JSON ONLY (no markdown). The object MUST include these keys:`;

  if (tier === 'pro') {
    return `${base}
{
  "detected_language": "string",
  "best": "PRIMARY: most appropriate version for the situation; natural, intentional, not generic",
  "safe": "neutral, correct, business-safe, no slang, no emoji",
  "engaging": "shorter or punchier than safe; clearly different wording/structure; 0-1 emoji allowed",
  "sns": "If input resembles a social post or social context: 1-3 sentences, strong hook, emotional, like a real post. If not applicable use empty string \"\". If sns would read almost the same as engaging, use \"\".",
  "variations": [
    { "type": "casual", "text": "1-2 sentences, clearly casual tone" },
    { "type": "emotional", "text": "1-2 sentences, clearly emotional tone" },
    { "type": "professional", "text": "1-2 sentences, clearly professional tone" }
  ]
}

Rules:
- "engaging" must NOT be a minor edit of "safe" (different structure and tone).
- "variations" must be clearly different from each other and from best/safe.
- Preserve line breaks inside strings where natural.`;
  }

  if (tier === 'free') {
    return `${base}
{
  "detected_language": "string",
  "best": "PRIMARY: most appropriate version in ${outputLang}",
  "safe": "neutral, correct, business-safe, no slang, no emoji",
  "engaging": "shorter or punchier than safe; clearly different; 0-1 emoji allowed",
  "sns": "",
  "variations": []
}

Rules:
- engaging must NOT be a minor edit of safe.
- sns must be "" and variations must be [].`;
  }

  return `${base}
{
  "detected_language": "string",
  "best": "PRIMARY: most appropriate version in ${outputLang}",
  "safe": "neutral, correct, business-safe, no slang, no emoji",
  "engaging": "",
  "sns": "",
  "variations": []
}

Rules:
- engaging must be "" and variations must be [].`;
}
