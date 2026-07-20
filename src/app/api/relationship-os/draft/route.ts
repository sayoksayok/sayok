import { NextRequest, NextResponse } from 'next/server';
import type { Company, Interaction, Opportunity, Person } from '@/lib/relationship-os-types';

export const maxDuration = 45;

function parseModelJson(text: string) {
  const clean = text.replace(/```json|```/g, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  const json = first >= 0 && last > first ? clean.slice(first, last + 1) : clean;
  return JSON.parse(json) as { subject?: string; body?: string; followUpTiming?: string };
}

function fallbackDraft(opportunity: Opportunity, person?: Person, company?: Company) {
  const firstName = person?.name?.split(' ')[0] || 'there';
  const companyName = company?.name || person?.company || 'your team';
  return {
    subject: `Next step for ${companyName}`,
    body: `Hi ${firstName},\n\nI wanted to follow up on ${opportunity.title}.\n\nThe useful next step seems to be: ${opportunity.desiredOk}\n\nWould you be open to a short call this week to decide whether this is worth moving forward?\n\nBest,\nYour name`,
    followUpTiming: 'Follow up in five business days unless they reply.',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      opportunity?: Opportunity;
      person?: Person;
      company?: Company;
      interactions?: Interaction[];
    };

    if (!body.opportunity) {
      return NextResponse.json({ error: 'Missing opportunity' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ draft: fallbackDraft(body.opportunity, body.person, body.company), source: 'fallback' });
    }

    const prompt = `You are SayOK, a practical relationship and deal execution assistant for founder-led business development.

Use the stored relationship context below. Write a concise next-action draft that can move the opportunity toward the desired OK.

Rules:
- Do not invent facts.
- Do not use exaggerated sales language.
- Keep it human and commercially realistic.
- If budget, decision-maker, or timing is unknown, ask one direct question.
- Return ONLY JSON with keys: subject, body, followUpTiming.

Opportunity:
${JSON.stringify(body.opportunity, null, 2)}

Person:
${JSON.stringify(body.person || null, null, 2)}

Company:
${JSON.stringify(body.company || null, null, 2)}

Recent interactions:
${JSON.stringify((body.interactions || []).slice(0, 5), null, 2)}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ draft: fallbackDraft(body.opportunity, body.person, body.company), source: 'fallback' });
    }

    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = data.content?.find((item) => item.type === 'text')?.text || '';
    const draft = parseModelJson(text);
    if (!draft.body) {
      return NextResponse.json({ draft: fallbackDraft(body.opportunity, body.person, body.company), source: 'fallback' });
    }

    return NextResponse.json({ draft, source: 'anthropic' });
  } catch {
    return NextResponse.json({ error: 'Could not generate draft' }, { status: 500 });
  }
}
