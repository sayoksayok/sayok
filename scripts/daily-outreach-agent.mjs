#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PRIVATE_DIR = path.join(ROOT, "sales-agent", "private");
const CAMPAIGNS_FILE = path.join(PRIVATE_DIR, "campaigns.json");
const STATE_FILE = path.join(PRIVATE_DIR, "state.json");
const OUTBOX_FILE = path.join(PRIVATE_DIR, "outbox.json");
const ENV_FILE = path.join(ROOT, ".env.sales-agent.local");
const args = new Set(process.argv.slice(2));
const campaignArg = process.argv.find((value) => value.startsWith("--campaign="));
const selectedCampaign = campaignArg?.split("=")[1] || (args.has("--campaign") ? process.argv[process.argv.indexOf("--campaign") + 1] : "all");
const live = args.has("--live");
const prepareOnly = args.has("--prepare") || !live;
const checkOnly = args.has("--check");

const blockedEmailLocals = new Set(["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster"]);
const blockedHosts = [
  "facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com",
  "youtube.com", "wikipedia.org", "crunchbase.com", "bloomberg.com",
  "reuters.com", "medium.com", "substack.com", "reddit.com", "github.com"
];

await loadEnv(ENV_FILE);

async function loadEnv(file) {
  try {
    const content = await fs.readFile(file, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requiredEnv(keys) {
  return keys.filter((key) => !process.env[key]);
}

function normalizeHost(input) {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function registrableDomain(host) {
  const parts = host.split(".").filter(Boolean);
  const twoPartSuffixes = new Set(["co.jp", "ne.jp", "or.jp", "com.au", "net.au", "org.au", "co.uk", "org.uk", "com.sg", "com.br"]);
  const suffix = parts.slice(-2).join(".");
  if (parts.length >= 3 && twoPartSuffixes.has(suffix)) return parts.slice(-3).join(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : host;
}

function cleanText(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validateCampaign(campaign) {
  const required = ["id", "name", "senderName", "senderCompany", "senderEmail", "website", "offer", "targetMarket", "gmailRefreshTokenEnv"];
  const missing = required.filter((key) => !campaign[key]);
  if (!Array.isArray(campaign.searchQueries) || campaign.searchQueries.length === 0) missing.push("searchQueries");
  if (!Number.isInteger(campaign.dailyLimit) || campaign.dailyLimit < 1 || campaign.dailyLimit > 10) missing.push("dailyLimit(1-10)");
  return missing;
}

function emailIsUsable(email, sourceUrl, website) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return false;
  const [local, host] = normalized.split("@");
  if (blockedEmailLocals.has(local) || !sourceUrl) return false;
  const siteHost = normalizeHost(website);
  if (!siteHost) return false;
  return registrableDomain(host) === registrableDomain(siteHost);
}

function isExcluded(campaign, lead, sent) {
  const host = normalizeHost(lead.website);
  const exclusions = (campaign.excludeDomains || []).map((item) => item.toLowerCase().replace(/^www\./, ""));
  const names = (campaign.excludeOrganizations || []).map((item) => item.toLowerCase());
  return !host ||
    blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`)) ||
    exclusions.some((blocked) => host === blocked || host.endsWith(`.${blocked}`)) ||
    names.some((name) => lead.organization.toLowerCase().includes(name)) ||
    sent.some((entry) => entry.email === lead.email || entry.domain === host);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${cleanText(text, 240)}`);
  return JSON.parse(text);
}

async function braveSearch(query, campaign) {
  const params = new URLSearchParams({
    q: `${query} ${campaign.targetMarket}`,
    count: "20",
    safesearch: "moderate",
    search_lang: campaign.searchLanguage || "en",
    country: campaign.searchCountry || "US"
  });
  const data = await fetchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY }
  });
  return (data.web?.results || []).map((result) => ({
    organization: cleanText(result.title?.replace(/\s+[|–—-].*$/, ""), 120),
    website: result.url,
    sourceUrl: result.url,
    evidence: cleanText(result.description, 500)
  }));
}

async function publicEmailsFromPage(url) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SayOKOutreach/1.0; +https://sayok.chat)" },
      redirect: "follow",
      signal: AbortSignal.timeout(18_000)
    });
    if (!response.ok || !String(response.headers.get("content-type") || "").includes("text/html")) return [];
    const html = (await response.text()).slice(0, 1_500_000);
    const decoded = html.replace(/&#64;|%40/gi, "@").replace(/&#46;|%2e/gi, ".");
    return [...new Set(decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 8);
  } catch {
    return [];
  }
}

async function hunterEmails(domain) {
  if (!process.env.HUNTER_API_KEY) return [];
  try {
    const params = new URLSearchParams({ domain, api_key: process.env.HUNTER_API_KEY, limit: "10" });
    const data = await fetchJson(`https://api.hunter.io/v2/domain-search?${params}`);
    return (data.data?.emails || []).map((entry) => ({
      email: entry.value,
      sourceUrl: entry.sources?.[0]?.uri || null,
      confidence: entry.confidence || 0,
      firstName: entry.first_name || "",
      lastName: entry.last_name || "",
      title: entry.position || ""
    }));
  } catch {
    return [];
  }
}

async function enrichLead(candidate) {
  const host = normalizeHost(candidate.website);
  if (!host) return null;
  const origin = `https://${host}`;
  const hunter = await hunterEmails(host);
  const verifiedHunter = hunter.find((entry) => entry.confidence >= 70 && emailIsUsable(entry.email, entry.sourceUrl, origin));
  if (verifiedHunter) return { ...candidate, website: origin, ...verifiedHunter };

  const pages = [candidate.website, `${origin}/contact`, `${origin}/contact-us`, `${origin}/about`];
  for (const page of pages) {
    const emails = await publicEmailsFromPage(page);
    const email = emails.find((value) => emailIsUsable(value, page, origin));
    if (email) return { ...candidate, website: origin, email, sourceUrl: page, confidence: 60, firstName: "", lastName: "", title: "" };
  }
  return null;
}

async function draftEmail(campaign, lead) {
  const proof = (campaign.proof || []).join("; ");
  const prompt = `You are an experienced founder-led B2B sales operator. Write one concise, genuinely personalized cold email.\n\nSERVICE CAMPAIGN (do not mix with any other service):\n${campaign.name}\nOffer: ${campaign.offer}\nProof allowed: ${proof}\nSender: ${campaign.senderName}, ${campaign.senderTitle || ""}, ${campaign.senderCompany}\nTarget: ${lead.organization} (${lead.website})\nPublic evidence: ${lead.evidence}\nLikely role: ${lead.title || (campaign.targetRoles || []).join(" / ")}\nCTA: ${campaign.cta}\nLanguage: ${campaign.language || "English"}\n\nRules:\n- Never invent facts, names, budgets, clients, or prior relationships.\n- Mention only evidence supplied above.\n- 90-150 words, plain language, no hype, no fake familiarity.\n- One concrete reason for contacting them and one low-friction CTA.\n- Do not mention AI or automated research.\n- Return JSON only: {"subject":"...","body":"..."}`;

  const data = await fetchJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: prompt }] })
  });
  const raw = (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n");
  const json = raw.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Draft response was not valid JSON");
  const parsed = JSON.parse(json);
  return { subject: cleanText(parsed.subject, 150), body: String(parsed.body || "").trim().slice(0, 3500) };
}

function emailFooter(campaign) {
  return [
    campaign.senderName,
    campaign.senderTitle,
    campaign.senderCompany,
    campaign.website,
    campaign.calendarUrl ? `Calendar: ${campaign.calendarUrl}` : "",
    "",
    "This message was sent to a business contact published on your organization's website.",
    "If this is not relevant or you prefer no further messages, reply and I will not contact you again."
  ].filter(Boolean).join("\n");
}

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function gmailAccessToken(campaign) {
  const refreshToken = process.env[campaign.gmailRefreshTokenEnv];
  if (!refreshToken) throw new Error(`Missing ${campaign.gmailRefreshTokenEnv}`);
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const data = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  return data.access_token;
}

async function assertGmailSender(token, campaign) {
  const [profile, settings] = await Promise.all([
    fetchJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token}` }
    }),
    fetchJson("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
      headers: { Authorization: `Bearer ${token}` }
    })
  ]);
  const expected = campaign.senderEmail.toLowerCase();
  const permitted = new Set([
    String(profile.emailAddress || "").toLowerCase(),
    ...(settings.sendAs || [])
      .filter((entry) => entry.verificationStatus === "accepted")
      .map((entry) => String(entry.sendAsEmail || "").toLowerCase())
  ]);
  if (!permitted.has(expected)) {
    throw new Error(`${campaign.name} must send from ${campaign.senderEmail}; the connected Gmail account does not permit that From address.`);
  }
}

function encodedSubject(value) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function sendGmail(campaign, lead, draft) {
  const token = await gmailAccessToken(campaign);
  await assertGmailSender(token, campaign);
  const displayName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const greeting = campaign.language === "Japanese"
    ? (displayName ? `${displayName}様` : "ご担当者様")
    : (displayName ? `Hi ${displayName},` : "Hi,");
  const body = `${greeting}\n\n${draft.body}\n\n${emailFooter(campaign)}`;
  const raw = [
    `From: ${campaign.senderName} <${campaign.senderEmail}>`,
    `To: ${lead.email}`,
    `Subject: ${encodedSubject(draft.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");
  const data = await fetchJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) })
  });
  return data.id;
}

async function runCampaign(campaign, state, outbox) {
  const history = state.campaigns[campaign.id] || { sent: [], suppressedEmails: [], suppressedDomains: [] };
  const candidates = [];
  for (const query of campaign.searchQueries.slice(0, 6)) {
    candidates.push(...await braveSearch(query, campaign));
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const host = normalizeHost(candidate.website);
    if (!host || unique.has(host)) continue;
    unique.set(host, candidate);
  }

  const prepared = [];
  for (const candidate of unique.values()) {
    if (prepared.length >= campaign.dailyLimit) break;
    const lead = await enrichLead(candidate);
    if (!lead || isExcluded(campaign, lead, history.sent)) continue;
    if (history.suppressedEmails.includes(lead.email) || history.suppressedDomains.includes(normalizeHost(lead.website))) continue;
    const draft = await draftEmail(campaign, lead);
    const record = {
      id: `${campaign.id}-${Date.now()}-${prepared.length + 1}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      preparedAt: new Date().toISOString(),
      organization: lead.organization,
      website: lead.website,
      email: lead.email,
      emailSourceUrl: lead.sourceUrl,
      evidence: lead.evidence,
      subject: draft.subject,
      body: draft.body,
      status: "prepared"
    };
    prepared.push({ record, lead, draft });
    outbox.push(record);
  }

  if (prepareOnly) return { campaign: campaign.name, prepared: prepared.length, sent: 0 };
  if (!campaign.enabled) throw new Error(`${campaign.name} is disabled. Set enabled=true only after reviewing its configuration.`);

  let sentCount = 0;
  for (const item of prepared) {
    const messageId = await sendGmail(campaign, item.lead, item.draft);
    item.record.status = "sent";
    item.record.sentAt = new Date().toISOString();
    item.record.gmailMessageId = messageId;
    history.sent.push({
      email: item.lead.email,
      domain: normalizeHost(item.lead.website),
      organization: item.lead.organization,
      sentAt: item.record.sentAt,
      gmailMessageId: messageId
    });
    sentCount += 1;
    await writeJson(STATE_FILE, state);
    await writeJson(OUTBOX_FILE, outbox);
  }
  state.campaigns[campaign.id] = history;
  return { campaign: campaign.name, prepared: prepared.length, sent: sentCount };
}

const config = await readJson(CAMPAIGNS_FILE, null);
if (!config?.campaigns?.length) {
  console.error(`Missing ${path.relative(ROOT, CAMPAIGNS_FILE)}. Copy sales-agent/campaigns.example.json and configure each service.`);
  process.exitCode = 1;
} else {
  const campaigns = selectedCampaign === "all"
    ? config.campaigns
    : config.campaigns.filter((campaign) => campaign.id === selectedCampaign);
  if (!campaigns.length) {
    console.error(`Unknown campaign: ${selectedCampaign}`);
    process.exitCode = 1;
  } else {
    const issues = campaigns.flatMap((campaign) => validateCampaign(campaign).map((field) => `${campaign.id}: ${field}`));
    const envKeys = ["BRAVE_SEARCH_API_KEY", "ANTHROPIC_API_KEY"];
    if (live) envKeys.push("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", ...campaigns.map((campaign) => campaign.gmailRefreshTokenEnv));
    const missingEnv = requiredEnv(envKeys);
    if (issues.length) {
      if (issues.length) console.error(`Invalid campaign configuration:\n- ${issues.join("\n- ")}`);
      process.exitCode = 1;
    } else if (checkOnly) {
      console.log(`Configuration OK: ${campaigns.map((campaign) => campaign.name).join(", ")}`);
      if (missingEnv.length) console.log(`Credentials still needed before execution: ${[...new Set(missingEnv)].join(", ")}`);
    } else if (missingEnv.length) {
      console.error(`Missing environment variables:\n- ${[...new Set(missingEnv)].join("\n- ")}`);
      process.exitCode = 1;
    } else {
      const state = await readJson(STATE_FILE, { version: 1, campaigns: {} });
      const outbox = await readJson(OUTBOX_FILE, []);
      for (const campaign of campaigns) {
        if (!state.campaigns[campaign.id]) state.campaigns[campaign.id] = { sent: [], suppressedEmails: [], suppressedDomains: [] };
      }
      const results = [];
      for (const campaign of campaigns) {
        results.push(await runCampaign(campaign, state, outbox));
      }
      await writeJson(STATE_FILE, state);
      await writeJson(OUTBOX_FILE, outbox);
      console.log(JSON.stringify({ mode: live ? "live" : "prepare", results }, null, 2));
    }
  }
}
