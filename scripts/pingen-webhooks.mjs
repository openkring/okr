#!/usr/bin/env node
// scripts/pingen-webhooks.mjs
//
// Registers the four Pingen letter webhooks (issues, sent, undeliverable, delivered) on our receiver
// `<functions base URL>/webhooks/pingen` (spec 1.150 §8). Idempotent: it lists the organisation's
// webhooks and creates only the categories that are not yet registered for that URL. Prints the ids.
//
// Usage (staging is the default; production needs --production):
//   PINGEN_CLIENT_ID=... PINGEN_CLIENT_SECRET=... PINGEN_ORGANISATION_ID=... \
//   PINGEN_WEBHOOK_SIGNING_KEY=... \
//   node scripts/pingen-webhooks.mjs --base-url https://europe-west6-<project>.cloudfunctions.net [--production] [--dry-run]
//
// Environment: PINGEN_CLIENT_ID, PINGEN_CLIENT_SECRET, PINGEN_ORGANISATION_ID, PINGEN_WEBHOOK_SIGNING_KEY
// (the same value as the function secret of that name). PINGEN_ENV=production is also honoured but, like
// the flag, only together with --production. Nothing is read from files and no secret is printed.
// --base-url may also come from FUNCTIONS_BASE_URL. No dependencies (Node 18+ fetch).

const CATEGORIES = ['issues', 'sent', 'undeliverable', 'delivered'];
const HOSTS = {
  staging: { api: 'https://api-staging.pingen.com', identity: 'https://identity-staging.pingen.com' },
  production: { api: 'https://api.pingen.com', identity: 'https://identity.pingen.com' },
};

function fail(message) {
  console.error(`pingen-webhooks: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { production: false, dryRun: false, baseUrl: process.env.FUNCTIONS_BASE_URL ?? '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--production') out.production = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--base-url') out.baseUrl = argv[++i] ?? '';
    else if (a.startsWith('--base-url=')) out.baseUrl = a.slice('--base-url='.length);
    else fail(`unknown argument ${a}`);
  }
  return out;
}

/** The environment this run targets; refuses production unless it was asked for explicitly. */
export function resolveEnv(args, env) {
  const wantsProduction = env.PINGEN_ENV === 'production';
  if ((args.production || wantsProduction) && !args.production) {
    throw new Error('PINGEN_ENV=production is set, but --production was not passed; refusing');
  }
  return args.production ? 'production' : 'staging';
}

/** The categories that have no webhook for `url` yet. */
export function missingCategories(existing, url) {
  const have = new Set(existing.filter((w) => w.url === url).map((w) => w.category));
  return CATEGORIES.filter((c) => !have.has(c));
}

async function call(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    // status and Pingen's error title only: bodies can echo secrets or personal data
    let title = '';
    try {
      title = String((await res.json())?.errors?.[0]?.title ?? '');
    } catch {
      /* no JSON body */
    }
    throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} -> ${res.status}${title ? ` ${title}` : ''}`);
  }
  return res.status === 204 ? undefined : res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = (() => {
    try {
      return resolveEnv(args, process.env);
    } catch (e) {
      return fail(e.message);
    }
  })();
  const { PINGEN_CLIENT_ID: clientId, PINGEN_CLIENT_SECRET: clientSecret, PINGEN_ORGANISATION_ID: org, PINGEN_WEBHOOK_SIGNING_KEY: signingKey } = process.env;
  for (const [name, value] of Object.entries({ PINGEN_CLIENT_ID: clientId, PINGEN_CLIENT_SECRET: clientSecret, PINGEN_ORGANISATION_ID: org, PINGEN_WEBHOOK_SIGNING_KEY: signingKey })) {
    if (!value) fail(`${name} is not set`);
  }
  if (!/^https:\/\/\S+$/.test(args.baseUrl)) fail('--base-url (https://...) is required');
  const url = `${args.baseUrl.replace(/\/+$/, '')}/webhooks/pingen`;
  const hosts = HOSTS[env];
  console.log(`environment: ${env}\nreceiver:    ${url}`);

  const token = await call(`${hosts.identity}/auth/access-tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  const auth = { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.api+json' };
  const base = `${hosts.api}/organisations/${encodeURIComponent(org)}/webhooks`;

  const existing = [];
  for (let page = 1; page <= 20; page++) {
    const body = await call(`${base}?page[number]=${page}&page[limit]=50`, { headers: auth });
    for (const d of body.data ?? []) existing.push({ id: d.id, category: d.attributes?.event_category, url: d.attributes?.url });
    if (!body.links?.next) break;
  }
  for (const w of existing.filter((x) => x.url === url)) console.log(`exists:  ${w.category.padEnd(14)} ${w.id}`);

  for (const category of missingCategories(existing, url)) {
    if (args.dryRun) {
      console.log(`would create: ${category}`);
      continue;
    }
    const created = await call(base, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/vnd.api+json' },
      body: JSON.stringify({ data: { type: 'webhooks', attributes: { event_category: category, url, signing_key: signingKey } } }),
    });
    console.log(`created: ${category.padEnd(14)} ${created.data?.id}`);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => fail(e.message));
}
