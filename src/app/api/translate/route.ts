import { NextRequest, NextResponse } from 'next/server';
import { buildSayokPrompt } from '@/lib/prompts/sayok';
import { targetLangNames } from '@/lib/translations';
import {
  buildUsageIdentity,
  isUsageEnforced,
  refundDailyCheck,
  resolveTierFromRequest,
  tryConsumeDailyCheck,
} from '@/lib/sayok-usage';

export const maxDuration = 60;

export type UserType = 'guest' | 'free' | 'pro';

const NORMAL_TIMEOUT_MS = 50000;
const LONG_MESSAGE_TIMEOUT_MS = 35000;
const RETRY_TIMEOUT_MS = 40000;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_RESPONSE_CHARS = 60000;
const MAX_RETRIES = 3;
const ANTHROPIC_CREDITS = 'ANTHROPIC_CREDITS';

/** Strict HTTP body (spec §3). */
export type SayOkStrictResponse = {
  best: string;
  safe: string;
  engaging: string;
  sns: string;
  variations: { type: string; text: string }[];
};

function maxCharsFor(userType: UserType): number {
  switch (userType) {
    case 'guest':
      return 500;
    case 'free':
      return 600;
    case 'pro':
      return 2000;
    default:
      return 500;
  }
}

function resolveOutputLanguage(targetLang: string, outputLanguageCustom?: string): string {
  const c = typeof outputLanguageCustom === 'string' ? outputLanguageCustom.trim() : '';
  if (c) return c.slice(0, 120);
  if (targetLang === 'other') return 'English';
  return targetLangNames[targetLang] || targetLang || 'English';
}

function tooSimilar(a: string, b: string, threshold = 0.82): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const wa = new Set(norm(a).split(/\s+/).filter(Boolean));
  const wb = new Set(norm(b).split(/\s+/).filter(Boolean));
  if (wa.size < 3 || wb.size < 3) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const j = inter / Math.max(wa.size, wb.size);
  return j >= threshold;
}

function normalizeVariations(raw: unknown): { type: string; text: string }[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(['casual', 'emotional', 'professional']);
  const out: { type: string; text: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { type?: string; text?: string };
    const type = String(o.type || '').toLowerCase();
    const text = String(o.text || '').trim();
    if (!allowed.has(type) || !text) continue;
    out.push({ type, text });
  }
  return out;
}

function parseModelJson(text: string): Record<string, unknown> | null {
  const clean = text.replace(/```json|```/g, '').trim();
  const capped = clean.length > MAX_RESPONSE_CHARS ? clean.slice(0, MAX_RESPONSE_CHARS) : clean;
  const first = capped.indexOf('{');
  const last = capped.lastIndexOf('}');
  const slice = first >= 0 && last > first ? capped.slice(first, last + 1) : capped;
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(slice.replace(/\s*$/, '') + '\n}') as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function internalToStrict(
  parsed: Record<string, unknown>,
  userType: UserType,
): { body: SayOkStrictResponse; detected_language: string } {
  const best = String(parsed.best || '').trim();
  const safe = String(parsed.safe || '').trim();
  const engaging = String(parsed.engaging || '').trim();
  let sns = String(parsed.sns || '').trim();
  let variations = normalizeVariations(parsed.variations);

  if (userType === 'guest') {
    return {
      detected_language: String(parsed.detected_language || ''),
      body: {
        best,
        safe,
        engaging: '',
        sns: '',
        variations: [],
      },
    };
  }

  if (userType === 'free') {
    return {
      detected_language: String(parsed.detected_language || ''),
      body: {
        best,
        safe,
        engaging,
        sns: '',
        variations: [],
      },
    };
  }

  if (sns && engaging && tooSimilar(sns, engaging)) {
    sns = '';
  }

  const needVarTypes = ['casual', 'emotional', 'professional'] as const;
  const byType = new Map(variations.map((v) => [v.type, v.text]));
  variations = needVarTypes.map((type) => ({
    type,
    text: byType.get(type) || '',
  }));

  return {
    detected_language: String(parsed.detected_language || ''),
    body: { best, safe, engaging, sns, variations },
  };
}

function validateQuality(body: SayOkStrictResponse, userType: UserType): string | null {
  if (!body.best || !body.safe) return 'empty_best_or_safe';
  if (userType === 'free' && !body.engaging.trim()) return 'missing_engaging';
  if (userType !== 'guest' && body.engaging && tooSimilar(body.engaging, body.safe)) return 'engaging_like_safe';
  if (userType === 'pro' && body.sns && body.engaging && tooSimilar(body.sns, body.engaging)) return 'sns_like_engaging';
  if (userType === 'pro') {
    for (const v of body.variations) {
      if (!v.text || v.text.trim().length < 2) return 'weak_variation';
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  let consumedSlot = false;
  let refundKey: string | null = null;
  let refundDate: string | null = null;

  const safeRefund = async () => {
    if (consumedSlot && refundKey && refundDate) {
      await refundDailyCheck(refundKey, refundDate);
      consumedSlot = false;
    }
  };

  try {
    const body = (await request.json()) as {
      inputText?: string;
      targetLang?: string;
      accessToken?: string;
      outputLanguageCustom?: string;
    };
    const { inputText, targetLang, accessToken, outputLanguageCustom } = body;

    if (inputText == null || inputText === '' || targetLang == null || targetLang === '') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { tier, userId } = await resolveTierFromRequest(
      typeof accessToken === 'string' ? accessToken : undefined,
    );
    const userType: UserType = tier;

    const inputStr = String(inputText);
    const inputLen = inputStr.length;
    const maxAllowed = maxCharsFor(userType);

    if (inputLen > maxAllowed) {
      return NextResponse.json(
        {
          error:
            userType === 'pro'
              ? 'This message is too long for your plan. Maximum 2,000 characters for Pro.'
              : userType === 'free'
                ? 'This message is too long. Maximum 600 characters for signed-in free accounts.'
                : 'This message is too long. Maximum 500 characters without signing in.',
        },
        { status: 400 },
      );
    }

    const usageDate = new Date().toISOString().slice(0, 10);
    const usageIdentity = buildUsageIdentity(tier, userId, request);

    if (isUsageEnforced()) {
      const allowed = await tryConsumeDailyCheck(usageIdentity, usageDate);
      if (!allowed) {
        return NextResponse.json(
          {
            error:
              tier === 'pro'
                ? 'Daily Pro limit reached (100 checks). Try again tomorrow.'
                : tier === 'free'
                  ? 'Daily free limit reached (5 checks). Upgrade to Pro for more, or try again tomorrow.'
                  : 'Daily limit reached (2 checks). Sign in for more free checks, or try again tomorrow.',
          },
          { status: 429 },
        );
      }
      consumedSlot = true;
      refundKey = usageIdentity.identityKey;
      refundDate = usageDate;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await safeRefund();
      return NextResponse.json(
        { error: 'SayOK is temporarily unavailable. Please try again later.' },
        { status: 200 },
      );
    }

    const outputLang = resolveOutputLanguage(String(targetLang), outputLanguageCustom);
    const max_tokens = Math.min(
      MAX_OUTPUT_TOKENS,
      inputLen > 2000 ? 4096 : inputLen > 800 ? 8192 : inputLen > 300 ? 4096 : 2000,
    );

    const callAnthropic = async (prompt: string, tokens: number, signal?: AbortSignal) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: tokens,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        console.error('Anthropic API error:', errData);
        const msg = errData?.error?.message ?? '';
        if (msg.toLowerCase().includes('credit') && (msg.toLowerCase().includes('low') || msg.toLowerCase().includes('balance'))) {
          throw new Error(ANTHROPIC_CREDITS);
        }
        throw new Error('SayOK service error');
      }
      return res.json() as Promise<{ content?: { text?: string }[] }>;
    };

    const extractText = (data: { content?: { text?: string }[] }) =>
      data.content?.map((item) => item.text || '').join('\n') || '';

    const timeoutMs = inputLen >= 1500 ? LONG_MESSAGE_TIMEOUT_MS : NORMAL_TIMEOUT_MS;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const prompt =
        attempt > 0
          ? `${buildSayokPrompt(userType, outputLang, inputStr)}\n\nIMPORTANT: Previous output failed validation (${lastError}). Regenerate with clearly differentiated versions. JSON only.`
          : buildSayokPrompt(userType, outputLang, inputStr);

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), attempt === 0 ? timeoutMs : RETRY_TIMEOUT_MS);
      let data: { content?: { text?: string }[] };
      try {
        data = await callAnthropic(prompt, max_tokens, controller.signal);
      } catch (e) {
        clearTimeout(tid);
        if (e instanceof Error && e.message === ANTHROPIC_CREDITS) {
          await safeRefund();
          return NextResponse.json(
            { error: 'SayOK is temporarily unavailable. Please try again later.' },
            { status: 200 },
          );
        }
        const isAbort = e instanceof Error && e.name === 'AbortError';
        if (attempt === MAX_RETRIES - 1) {
          await safeRefund();
          return NextResponse.json(
            {
              error: isAbort
                ? 'This took too long. Try a shorter message or try again.'
                : 'Something went wrong. Please try again.',
            },
            { status: 200 },
          );
        }
        lastError = 'request_failed';
        continue;
      }
      clearTimeout(tid);

      const raw = extractText(data);
      const parsed = parseModelJson(raw);
      if (!parsed) {
        lastError = 'invalid_json';
        continue;
      }

      const { body, detected_language } = internalToStrict(parsed, userType);
      const q = validateQuality(body, userType);
      if (q) {
        lastError = q;
        continue;
      }

      const res = NextResponse.json(body);
      if (detected_language) {
        res.headers.set('X-SayOK-Detected-Language', detected_language.slice(0, 120));
      }
      consumedSlot = false;
      return res;
    }

    await safeRefund();
    return NextResponse.json(
      { error: 'Could not generate a valid response. Try again or shorten your message.' },
      { status: 200 },
    );
  } catch (error) {
    await safeRefund();
    console.error('SayOK translate error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 200 });
  }
}
