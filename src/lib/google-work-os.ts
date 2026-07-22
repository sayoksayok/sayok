import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './work-os-server';

export type GoogleConnection = {
  id: string;
  workspace_id: string;
  user_id: string;
  google_email: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  gmail_connected: boolean;
  calendar_connected: boolean;
  status: 'connected' | 'needs_reauth' | 'revoked' | 'error';
  last_sync_at: string | null;
  last_error: string | null;
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  internalDate?: string;
};

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
};

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

function headerValue(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export function parseGmailMessage(message: GmailMessage) {
  const subject = headerValue(message, 'Subject');
  const from = headerValue(message, 'From');
  const to = headerValue(message, 'To');
  const fromEmail = from.match(/<([^>]+)>/)?.[1] || from.match(/[^\s<>]+@[^\s<>]+/)?.[0] || from || null;
  const fromName = from.includes('<') ? from.replace(/<[^>]+>/, '').replaceAll('"', '').trim() : null;
  const toEmails = Array.from(to.matchAll(/[^\s<>,;]+@[^\s<>,;]+/g)).map((match) => match[0]);
  const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
  return {
    external_id: message.id,
    thread_id: message.threadId || null,
    from_email: fromEmail,
    from_name: fromName,
    to_emails: toEmails,
    subject: subject || '(no subject)',
    snippet: message.snippet || '',
    received_at: receivedAt,
    source_url: message.threadId ? `https://mail.google.com/mail/u/0/#inbox/${message.threadId}` : null,
    raw: message,
  };
}

async function googleFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google API ${response.status}: ${body.slice(0, 400)}`);
  }

  return response.json() as Promise<T>;
}

export async function refreshGoogleAccessToken(admin: SupabaseClient, connection: GoogleConnection) {
  const refreshToken = decryptToken(connection.encrypted_refresh_token);
  if (!refreshToken) throw new Error('Google refresh token is missing. Reconnect Google.');
  if (!googleClientId || !googleClientSecret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for token refresh.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token refresh failed: ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number; scope?: string };
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  const { error } = await admin
    .from('work_os_google_connections')
    .update({
      encrypted_access_token: encryptToken(data.access_token),
      token_expires_at: expiresAt,
      scopes: data.scope ? data.scope.split(/\s+/) : connection.scopes,
      status: 'connected',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);
  if (error) throw new Error(error.message);
  return data.access_token;
}

export async function getValidGoogleAccessToken(admin: SupabaseClient, connection: GoogleConnection) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const currentToken = decryptToken(connection.encrypted_access_token);
  if (currentToken && expiresAt > Date.now() + 60_000) return currentToken;
  return refreshGoogleAccessToken(admin, connection);
}

export async function listRecentGmailMessages(accessToken: string) {
  const list = await googleFetch<{ messages?: Array<{ id: string; threadId: string }> }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?' +
      new URLSearchParams({
        maxResults: '10',
        q: 'newer_than:30d -category:promotions -category:social',
      }),
    accessToken,
  );
  const messages = list.messages || [];
  return Promise.all(
    messages.map((message) => {
      const params = new URLSearchParams({ format: 'metadata' });
      params.append('metadataHeaders', 'Subject');
      params.append('metadataHeaders', 'From');
      params.append('metadataHeaders', 'To');
      return googleFetch<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?${params.toString()}`, accessToken);
    }),
  );
}

export async function listCalendarEvents(accessToken: string) {
  const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const result = await googleFetch<{ items?: CalendarEvent[] }>(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
      new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '20',
        timeMin,
        timeMax,
      }),
    accessToken,
  );
  return result.items || [];
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createGmailDraft(accessToken: string, input: { to: string; subject: string; body: string }) {
  const raw = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.body,
  ].join('\r\n');

  return googleFetch<{ id: string; message: { id: string; threadId?: string } }>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw: base64Url(raw) } }),
  });
}

export function isActionableEmail(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`.toLowerCase();
  return /proposal|intro|introduction|meeting|call|follow up|follow-up|partnership|collaboration|sponsor|contract|next step|available|schedule|interested/.test(text);
}
