#!/usr/bin/env node
/**
 * Seeds the `link` alias space — the namespace behind "Link zum Termin kopieren".
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>`: the space `name`
 *   goes into the document id of every alias minted in it and is UNCHANGEABLE afterwards,
 *   so a typo'd tenant cannot be corrected in place.
 *   The script refuses to touch a `link` space that already exists — its settings may have
 *   been adjusted by hand in the app, and overwriting `name`, `charset` or `caseSensitive`
 *   under existing aliases would invalidate codes that are already in circulation.
 *
 * The space is `kind: 'redirect'` and `targetTypes: ['url']`: calevent has no detail route,
 * so a short link resolves to the list route plus `?event=<okey>` (see buildCalEventLink).
 * `roleNeeded: 'registered'` is deliberate — `resolveAlias` mints once per event and hands
 * every later caller the same code, so opening this to all members cannot grow the alias
 * list per click.
 *
 * The tenant needs a `/s/**` hosting rewrite to `publicApi` in firebase.json, otherwise the
 * SPA fallback swallows every short link. Today that is scs, p13 and kring.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const has = (name) => args.includes(`--${name}`);

const tenantId = flag('tenant');
const isWrite = has('write');

if (!tenantId) fail('--tenant=<id> is mandatory.');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const SPACE = {
  tenants: [tenantId],
  isArchived: false,
  notes: 'Kurzlinks zum Teilen (Termine, später weitere Modelle).',
  name: 'link',
  label: 'Kurzlinks',
  kind: 'redirect',
  length: 6,
  charset: 'base32-safe',
  allowCustom: false,
  caseSensitive: false,
  targetTypes: ['url'],
  defaultValidDays: 0,
  defaultMaxUses: 0,
  trackingLevel: 'counter',
  retentionDays: 365,
  roleNeeded: 'registered',
  isEnabled: true,
};

const config = await db.collection('app-config').doc(tenantId).get();
if (!config.exists) fail(`Unknown tenant '${tenantId}' — no app-config/${tenantId}.`);

const existing = await db.collection('aliasSpaces')
  .where('tenants', 'array-contains', tenantId)
  .where('name', '==', 'link')
  .limit(1)
  .get();

if (!existing.empty) {
  console.log(`· ${tenantId}: space 'link' already exists (${existing.docs[0].id}) — left untouched.`);
  process.exit(0);
}

if (!isWrite) {
  console.log(`DRY RUN — would create aliasSpaces/${tenantId}-link:`);
  console.log(JSON.stringify(SPACE, null, 2));
  console.log('\nRe-run with --write to actually create it.');
  process.exit(0);
}

await db.collection('aliasSpaces').doc(`${tenantId}-link`).create(SPACE);
console.log(`✓ ${tenantId}: created aliasSpaces/${tenantId}-link`);

function fail(message) {
  console.error(`seed-link-space: ${message}`);
  process.exit(1);
}
