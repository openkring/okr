/**
 * ONE-TIME MIGRATION — Seeclub (tenant `scs`) family rebates -> households (spec 1.168 §5.1, §4.2, §8).
 *
 * Today the treasurer works out family rebates by hand: memberships with `rebateReason == 'family'`.
 * `--propose` suggests households from them (grouped by favourite postal address) as a CSV for the treasurer to
 * confirm; `--apply` creates the confirmed ones.
 *
 * Modes:
 *   --propose --tenant scs [--out <file>]       read-only. Prints the CSV to stdout (PERSONAL DATA: names).
 *   --apply <csv> --tenant scs [--dry]          creates households with the admin SDK; --dry writes nothing.
 *   --help
 *
 * CSV: household,personKey,firstName,lastName,payer,contact   (payer/contact: `x` or empty).
 * Lines with the same `household` value form one household; that value is the household `name`.
 * Apply refuses (and prints) a household with no contact, two payers, two contacts, a duplicate person, fewer
 * than two members, a shape error (`householdShapeError`, same rules as `saveHousehold`), or a member who is
 * already in another active household of the tenant.
 *
 * PERSONAL DATA: the CSV never goes into the repo. The script writes nothing to disk unless `--out <file>`
 * is given. Propose prints names (and personKeys), never addresses; apply refusals name households and line numbers only.
 * `--out` files are written 0600 and may not lie inside the repo.
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail; dist/ is git-ignored):
 *   pnpm exec esbuild scripts/migrate-family-households.ts --bundle --platform=node --packages=external \
 *     --format=cjs --outfile=dist/scripts/migrate-family-households.cjs
 *   node dist/scripts/migrate-family-households.cjs --propose --tenant scs --out ~/Desktop/families.csv
 *   node dist/scripts/migrate-family-households.cjs --apply ~/Desktop/families.csv --tenant scs --dry
 *   node dist/scripts/migrate-family-households.cjs --apply ~/Desktop/families.csv --tenant scs
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 * Run the owner steps (confirm the CSV, set the cap with seed-household-type-category.mjs) per the plan, Task 10.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { DEFAULT_HOUSEHOLD_BUNDLE, HouseholdCollection, HouseholdModel } from '@okr/shared-models';
import type { AddressModel } from '@okr/shared-models';
import {
  addIndexElement,
  DateFormat,
  getTodayStr,
  householdShapeError,
  isActiveMembership,
  pickCurrentFavoritePostal,
} from '@okr/shared-util-core';

import { addressKey, chunk, groupByAddress, isInside, parseCsv, personRefusal, toCsv, validateRows } from './migrate-family-households.logic.mjs';

const PROJECT_ID = 'bkaiser-org';
const IN_CHUNK = 30; // Firestore: at most 30 values in array-contains-any

const USAGE = `Usage:
  --propose --tenant <id> [--out <file>]     print (or write to <file>) the proposed households as CSV
  --apply <csv> --tenant <id> [--dry]        create the confirmed households (--dry: write nothing)
  --help`;

function arg(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}
function fail(msg: string): never {
  console.error(`error: ${msg}\n\n${USAGE}`);
  exit(1);
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

async function propose(tenantId: string, out: string | undefined): Promise<void> {
  const db = getFirestore();
  const today = getTodayStr(DateFormat.StoreDate);
  const snap = await db.collection('memberships').where('tenants', 'array-contains', tenantId).where('rebateReason', '==', 'family').get();
  const people = new Map<string, { personKey: string; firstName: string; lastName: string }>();
  for (const d of snap.docs) {
    const m = d.data();
    if (m['memberModelType'] !== 'person' || !isActiveMembership({ isArchived: m['isArchived'] === true, dateOfExit: asString(m['dateOfExit']) }, today)) continue;
    const personKey = asString(m['memberKey']);
    if (personKey && !people.has(personKey)) people.set(personKey, { personKey, firstName: asString(m['memberName1']), lastName: asString(m['memberName2']) });
  }

  const rows: { personKey: string; firstName: string; lastName: string; key: string }[] = [];
  for (const p of people.values()) {
    const as = await db.collection('addresses').where('parentKey', '==', `person.${p.personKey}`).where('addressChannel', '==', 'postal').get();
    const addrs = as.docs
      .map((a) => ({ ...(a.data() as AddressModel), okey: a.id }))
      .filter((a) => Array.isArray(a.tenants) && a.tenants.includes(tenantId));
    rows.push({ ...p, key: addressKey(pickCurrentFavoritePostal(addrs, today)) });
  }

  const { groups, unplaced } = groupByAddress(rows);
  const csvRows: Record<string, string>[] = [];
  const used = new Set<string>();
  let single = 0;
  for (const g of groups) {
    if (g.length < 2) {
      single++;
      continue;
    }
    let name = `Familie ${g[0].lastName}`.trim();
    for (let n = 2; used.has(name); n++) name = `Familie ${g[0].lastName} ${n}`.trim();
    used.add(name);
    g.forEach((r, i) => csvRows.push({ household: name, personKey: r.personKey, firstName: r.firstName, lastName: r.lastName, payer: i === 0 ? 'x' : '', contact: i === 0 ? 'x' : '' }));
  }
  const csv = toCsv(csvRows);
  if (out) writeFileSync(out, csv, { mode: 0o600 });
  else process.stdout.write(csv);
  console.error(`${used.size} proposed households, ${single} persons alone at their address, ${unplaced.length} without postal address (not proposed). Payer and contact are a guess (first line): the treasurer must check them.`);
}

async function apply(tenantId: string, csvPath: string, dry: boolean): Promise<void> {
  const db = getFirestore();
  const { households, refused } = validateRows(parseCsv(readFileSync(csvPath, 'utf8')));
  const col = db.collection(HouseholdCollection);
  const created: HouseholdModel[] = [];
  let stopped = '';

  // every member must be a real, active person of the tenant (read-only; also under --dry)
  const keys = [...new Set(households.flatMap((h) => h.memberKeys))];
  const persons = new Map<string, { isArchived?: boolean; tenants?: unknown } | undefined>();
  for (const part of chunk(keys, 300)) {
    const docs = await db.getAll(...part.map((k) => db.collection('persons').doc(k)));
    docs.forEach((d, i) => persons.set(part[i], d.exists ? (d.data() as { isArchived?: boolean; tenants?: unknown }) : undefined));
  }
  const accepted = new Set<string>(); // members of households accepted so far in this run

  try {
  for (const h of households) {
    const personProblem = h.memberKeys.map((k) => personRefusal(persons.get(k) as never, tenantId)).find((r) => r !== undefined);
    if (personProblem) {
      refused.push({ household: h.name, lines: h.lines, reason: personProblem });
      continue;
    }
    // the tenant's other active households of these members
    const others = new Map<string, HouseholdModel>();
    for (const part of chunk(h.memberKeys, IN_CHUNK)) {
      const snap = await col.where('memberKeys', 'array-contains-any', part).get();
      for (const d of snap.docs) {
        if (d.get('isArchived') === true) continue;
        const t = d.get('tenants');
        if (!Array.isArray(t) || t.length !== 1 || t[0] !== tenantId) continue;
        const m = new HouseholdModel(tenantId);
        m.okey = d.id;
        m.memberKeys = Array.isArray(d.get('memberKeys')) ? d.get('memberKeys') : [];
        others.set(d.id, m);
      }
    }
    const doc = new HouseholdModel(tenantId);
    doc.name = h.name;
    doc.type = 'family';
    doc.memberKeys = h.memberKeys;
    doc.payerKey = h.payerKey;
    doc.contactKey = h.contactKey;
    doc.bundle = { ...DEFAULT_HOUSEHOLD_BUNDLE };
    doc.isArchived = false;
    doc.index = addIndexElement('', 'n', doc.name.trim());
    const running = new HouseholdModel(tenantId);
    running.okey = '__run';
    running.memberKeys = [...accepted];
    const err = householdShapeError(doc, [...others.values(), running]);
    if (err) {
      refused.push({ household: h.name, lines: h.lines, reason: err });
      continue;
    }
    created.push(doc);
    h.memberKeys.forEach((k) => accepted.add(k));
  }

  } catch (e) {
    stopped = e instanceof Error ? e.message : String(e);
  }
  const written: string[] = [];
  if (!dry && !stopped) {
    try {
      for (const doc of created) {
        const { okey: _okey, ...stored } = doc;
        void _okey;
        await col.add(stored);
        written.push(doc.name);
      }
    } catch (e) {
      stopped = e instanceof Error ? e.message : String(e);
    }
  }
  for (const r of refused) console.error(`refused: "${r.household}" lines ${r.lines.join(',')}: ${r.reason}`);
  const n = dry ? created.length : written.length;
  console.log(`${dry ? '(dry run, nothing written) ' : ''}${n} ${dry ? 'would be created' : 'created'}, ${refused.length} refused${stopped ? `, run stopped early: ${stopped}` : ''}`);
  if (stopped) exit(1);
}

async function main(): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const tenantId = arg('--tenant');
  if (!tenantId || tenantId.startsWith('--')) fail('--tenant <id> is required');
  const isPropose = argv.includes('--propose');
  const csvPath = arg('--apply');
  if (isPropose === (csvPath !== undefined)) fail('give exactly one of --propose or --apply <csv>');
  if (csvPath !== undefined && csvPath.startsWith('--')) fail('--apply needs a CSV path');
  const out = arg('--out');
  if (out !== undefined && (out.startsWith('--') || !isPropose)) fail('--out <file> works with --propose only');
  if (out !== undefined && isInside(process.cwd(), resolve(out))) fail('--out must lie outside the repository (the CSV holds personal data)');
  if (argv.includes('--dry') && isPropose) fail('--dry works with --apply only');

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  // the tenant must exist (read-only; also under --dry)
  if (!(await getFirestore().collection('app-config').doc(tenantId).get()).exists) fail(`unknown tenant "${tenantId}" (no app-config/${tenantId})`);
  if (isPropose) await propose(tenantId, out);
  else await apply(tenantId, csvPath as string, argv.includes('--dry'));
}

main().catch((e) => {
  console.error(e);
  exit(1);
});
