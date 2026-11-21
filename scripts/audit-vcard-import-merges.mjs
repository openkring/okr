#!/usr/bin/env node
/**
 * Audits the persons of one tenant for vCard-import MERGES: another person's card folded into
 * them. READ-ONLY — there is no write path; which rows belong to whom is a human decision.
 *
 * WHY: on 2026-11-15 a bka vCard import merged one family member's card into another, because
 * the other was the only person yet holding the home landline (spec 1.159 §4.1 phone rule). The
 * merged card's emails, phones, links and postal rows landed on that person and replicated into
 * their other tenants. The matcher has a first-name guard since 2026-11-21; this script finds the others.
 *
 * Signals, per person, over the address rows created on --day (Firestore createTime,
 * Europe/Zurich):
 *   S1 FOREIGN NAME   an email/web value of a new row contains the first name of ANOTHER person
 *                     with the same last name, and not the person's own first name
 *   S2 HOUSEHOLD LINE a new phone row whose number another same-last-name person also holds
 *   S3 VOLUME         unusually many new rows (≥ --min-rows, default 10) or new postal rows
 *                     (≥ --min-postal, default 3)
 * S1 and S2 are the merge signature; S3 alone is mostly genuine address history.
 *
 * Run:      node scripts/audit-vcard-import-merges.mjs --tenant=bka --day=2026-11-15 --out=~/vcard-merge-audit.md
 * Requires: gcloud auth application-default login
 * The report holds real names: --out must lie outside the repository; without it, stdout.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, def = '') => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? def;
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };

const tenantId = flag('tenant') || fail('--tenant=<id> is mandatory.');
const day = flag('day', '2026-11-15');
const minRows = Number(flag('min-rows', '10'));
const minPostal = Number(flag('min-postal', '3'));
const outPath = flag('out');
const resolvedOut = outPath ? path.resolve(outPath.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')) : '';
if (resolvedOut && resolvedOut.startsWith(ROOT + path.sep)) fail(`--out must lie OUTSIDE the repository (${ROOT}).`);

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const fold = (v) => (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').trim();
/** ascii-folded variants of a first name as it appears in an email: `jörg` → jorg, joerg */
function nameVariants(first) {
  const raw = (first ?? '').toLowerCase().split(/[\s-]+/)[0] ?? '';
  const a = fold(raw);
  const b = raw.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return [...new Set([a, b])].filter((v) => v.length >= 3);
}
const phoneDigits = (p) => {
  let d = (p ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = `41${d.slice(1)}`;
  return d.length >= 9 ? d : '';
};
const zurichDay = (ts) => ts.toDate().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });

const [personSnap, addrSnap] = await Promise.all([
  db.collection('persons').where('tenants', 'array-contains', tenantId).get(),
  db.collection('addresses').where('tenants', 'array-contains', tenantId).get(),
]);
const persons = new Map(personSnap.docs.filter((d) => !d.get('isArchived')).map((d) => [d.id, { okey: d.id, firstName: d.get('firstName') ?? '', lastName: d.get('lastName') ?? '' }]));

const rowsByPerson = new Map();
for (const d of addrSnap.docs) {
  const parentKey = d.get('parentKey') ?? '';
  if (!parentKey.startsWith('person.') || d.get('isArchived')) continue;
  const okey = parentKey.slice('person.'.length);
  if (!persons.has(okey)) continue;
  const row = { id: d.id, channel: d.get('addressChannel'), email: d.get('email') ?? '', phone: d.get('phone') ?? '', url: d.get('url') ?? '',
    postal: [d.get('streetName'), d.get('streetNumber'), d.get('zipCode'), d.get('city')].filter(Boolean).join(' '), tenants: d.get('tenants') ?? [],
    isNew: zurichDay(d.createTime) === day };
  (rowsByPerson.get(okey) ?? rowsByPerson.set(okey, []).get(okey)).push(row);
}

const byLast = new Map();
for (const p of persons.values()) { const k = fold(p.lastName); if (k) (byLast.get(k) ?? byLast.set(k, []).get(k)).push(p); }
const phoneHolders = new Map();
for (const [okey, rows] of rowsByPerson) for (const r of rows) if (r.channel === 'phone') {
  const k = phoneDigits(r.phone); if (k) (phoneHolders.get(k) ?? phoneHolders.set(k, new Set()).get(k)).add(okey);
}

const findings = [];
let newRowsTotal = 0;
for (const [okey, rows] of rowsByPerson) {
  const p = persons.get(okey);
  const fresh = rows.filter((r) => r.isNew);
  newRowsTotal += fresh.length;
  if (!fresh.length) continue;
  const own = nameVariants(p.firstName);
  const kin = (byLast.get(fold(p.lastName)) ?? []).filter((o) => o.okey !== okey && fold(o.firstName) !== fold(p.firstName));
  const s1 = [];
  for (const r of fresh.filter((r) => r.channel === 'email' || r.channel === 'web')) {
    const v = fold(r.email || r.url);
    if (own.some((n) => v.includes(n))) continue;
    const hit = kin.find((o) => nameVariants(o.firstName).some((n) => v.includes(n)));
    if (hit) s1.push(`${r.email || r.url} → ${hit.firstName} ${hit.lastName} (${hit.okey})`);
  }
  const s2 = [];
  for (const r of fresh.filter((r) => r.channel === 'phone')) {
    const others = [...(phoneHolders.get(phoneDigits(r.phone)) ?? [])].filter((o) => o !== okey && kin.some((k) => k.okey === o));
    if (others.length) s2.push(`${r.phone} also on ${others.map((o) => `${persons.get(o).firstName} (${o})`).join(', ')}`);
  }
  const postal = fresh.filter((r) => r.channel === 'postal').length;
  const s3 = fresh.length >= minRows || postal >= minPostal;
  if (!s1.length && !s2.length && !s3) continue;
  const foreignTenants = [...new Set(fresh.flatMap((r) => r.tenants))].filter((t) => t !== tenantId);
  findings.push({ p, fresh: fresh.length, postal, s1, s2, s3, foreignTenants, score: s1.length * 3 + s2.length * 2 + (s3 ? 1 : 0) });
}
findings.sort((a, b) => b.score - a.score || b.fresh - a.fresh);

const lines = [
  `# vCard import merge audit — tenant ${tenantId}, rows created ${day}`, '',
  `Persons: ${persons.size} · address rows created that day: ${newRowsTotal} · flagged: ${findings.length}`,
  `Strong (S1 foreign name or S2 household line): ${findings.filter((f) => f.s1.length || f.s2.length).length} · volume only (S3): ${findings.filter((f) => !f.s1.length && !f.s2.length).length}`, '',
  '| Person | okey | new rows | new postal | S1 foreign name | S2 household line | other tenants |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...findings.map((f) => `| ${f.p.firstName} ${f.p.lastName} | \`${f.p.okey}\` | ${f.fresh} | ${f.postal} | ${f.s1.join('<br>') || '—'} | ${f.s2.join('<br>') || '—'} | ${f.foreignTenants.join(', ') || '—'} |`),
  '',
];
if (resolvedOut) { writeFileSync(resolvedOut, lines.join('\n')); console.log(`✔ ${findings.length} findings → ${resolvedOut}`); }
else console.log(lines.join('\n'));
