#!/usr/bin/env node
/**
 * Audits vCard-import merges against the ORIGINAL .vcf the import read. READ-ONLY.
 *
 * WHY: audit-vcard-import-merges.mjs guesses merges from name heuristics. With the source file
 * at hand there is no need to guess: every address row the import created on --day either
 * appears on the person's OWN card in the file, or it was copied from SOMEBODY ELSE's card —
 * that is a merge (2026-11-15: family members merged into one another through a shared
 * home landline or family email).
 *
 * Per person with rows created on --day (Firestore createTime, Europe/Zurich), each active row
 * is classified by its value:
 *   OWN      the value is on a card carrying the person's name (shared values included)
 *   FOREIGN  not on the own card, but on another card → the merge signature; the report names
 *            that card and, when one exists, the bka person carrying its name
 *   UNKNOWN  on no card at all (entered in the app, or a value the import rewrote)
 *   GENERIC  on more than --max-shared cards (default 3): skipped, it identifies nobody
 * A person with no card of their name is listed separately: their rows cannot be judged.
 *
 * Run:      node scripts/audit-vcard-import-backup.mjs --tenant=bka --vcf=~/Desktop/x.vcf --out=~/audit.md
 * Requires: gcloud auth application-default login. --out must lie outside the repo (real names).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, def = '') => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? def;
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };
const home = (p) => (p ? path.resolve(p.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')) : '');

const tenantId = flag('tenant') || fail('--tenant=<id> is mandatory.');
const vcfPath = home(flag('vcf')) || fail('--vcf=<backup.vcf> is mandatory.');
const day = flag('day', '2026-11-15');
/** a value on more cards than this (a company website, "Zürich Area") identifies nobody */
const maxShared = Number(flag('max-shared', '3'));
const outPath = home(flag('out'));
if (outPath && outPath.startsWith(ROOT + path.sep)) fail(`--out must lie OUTSIDE the repository (${ROOT}).`);

// ---- normalisation: the same value must fold to the same key on both sides ----
const fold = (v) => (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const firstTok = (v) => fold(v).replace(/\./g, ' ').split(/[\s-]+/).find(Boolean) ?? '';
const nameKey = (first, last) => `${fold(last).replace(/\*$/, '').trim()}|${firstTok(first)}`;
const phoneKey = (p) => {
  let d = (p ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = `41${d.slice(1)}`;
  return d.length >= 9 ? `t:${d}` : '';
};
const emailKey = (e) => (e ? `e:${fold(e)}` : '');
const urlKey = (u) => {
  const v = fold(u).replace(/^https?:\/\//, '').replace(/^www\./, '')
    .replace(/^(xing\.com\/profile|facebook\.com|linkedin\.com\/in|twitter\.com|instagram\.com)\//, '').replace(/\/$/, '');
  return v ? `u:${v}` : '';
};
const streetFold = (s) => fold(s).replace(/str(\.|\b)/g, 'strasse').replace(/[^a-z0-9]/g, '');
const postalKey = (street, zip, city) => {
  const z = (zip ?? '').replace(/\D/g, '');
  const s = streetFold(street);
  return s ? `p:${s}|${z}` : (city ? `p:${fold(city).replace(/[^a-z]/g, '')}` : '');
};

// ---- the backup: minimal vCard 3.0 reader (unfold, group prefix, escapes) ----
const unesc = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const cards = [];
let cur = null;
const raw = readFileSync(vcfPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
for (const line of raw.split('\n')) {
  if (line === 'BEGIN:VCARD') { cur = { first: '', last: '', fn: '', keys: new Set(), bday: '' }; continue; }
  if (line === 'END:VCARD') { if (cur) cards.push(cur); cur = null; continue; }
  if (!cur) continue;
  const i = line.indexOf(':'); if (i < 0) continue;
  const prop = line.slice(0, i).split(';')[0].replace(/^item\d+\./i, '').toUpperCase();
  const value = line.slice(i + 1);
  if (prop === 'N') { const [last, first] = value.split(';'); cur.last = unesc(last ?? ''); cur.first = unesc(first ?? ''); }
  else if (prop === 'FN') cur.fn = unesc(value);
  else if (prop === 'EMAIL') cur.keys.add(emailKey(unesc(value)));
  else if (prop === 'TEL') cur.keys.add(phoneKey(value));
  else if (prop === 'URL' || prop === 'X-SOCIALPROFILE') cur.keys.add(urlKey(unesc(value)));
  else if (prop === 'ADR') {
    const [, ext, street, city, , zip] = value.split(/(?<!\\);/).map(unesc);
    cur.keys.add(postalKey(street || ext, zip, city));
  } else if (prop === 'BDAY') cur.bday = value.replace(/\D/g, '').slice(0, 8);
}
for (const c of cards) { c.keys.delete(''); c.name = `${c.first} ${c.last}`.trim() || c.fn; c.nk = nameKey(c.first, c.last); }
const cardsByName = new Map();
const cardsByKey = new Map();
for (const c of cards) {
  (cardsByName.get(c.nk) ?? cardsByName.set(c.nk, []).get(c.nk)).push(c);
  for (const k of c.keys) (cardsByKey.get(k) ?? cardsByKey.set(k, []).get(k)).push(c);
}

// ---- the tenant ----
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const zurichDay = (ts) => ts.toDate().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
const [personSnap, addrSnap] = await Promise.all([
  db.collection('persons').where('tenants', 'array-contains', tenantId).get(),
  db.collection('addresses').where('tenants', 'array-contains', tenantId).get(),
]);
const persons = new Map(personSnap.docs.filter((d) => !d.get('isArchived'))
  .map((d) => [d.id, { okey: d.id, firstName: d.get('firstName') ?? '', lastName: d.get('lastName') ?? '' }]));
const personsByName = new Map();
for (const p of persons.values()) { const k = nameKey(p.firstName, p.lastName); (personsByName.get(k) ?? personsByName.set(k, []).get(k)).push(p); }

const rowKey = (d) => {
  switch (d.get('addressChannel')) {
    case 'email': return emailKey(d.get('email'));
    case 'phone': return phoneKey(d.get('phone'));
    case 'postal': return postalKey(`${d.get('streetName') ?? ''} ${d.get('streetNumber') ?? ''}`, d.get('zipCode'), d.get('city'));
    case 'dob': return `d:${d.get('dob') ?? ''}`;
    case 'iban': case 'ssn': case 'dod': return '';
    default: return urlKey(d.get('url'));
  }
};
const rowLabel = (d) => d.get('email') || d.get('phone') || d.get('url') || d.get('dob')
  || [d.get('streetName'), d.get('streetNumber'), d.get('zipCode'), d.get('city')].filter(Boolean).join(' ');

const rowsByPerson = new Map();
let newRows = 0;
for (const d of addrSnap.docs) {
  const pk = d.get('parentKey') ?? '';
  if (!pk.startsWith('person.') || d.get('isArchived') || zurichDay(d.createTime) !== day) continue;
  const okey = pk.slice(7);
  if (!persons.has(okey)) continue;
  newRows++;
  (rowsByPerson.get(okey) ?? rowsByPerson.set(okey, []).get(okey)).push(d);
}

const target = (c) => (personsByName.get(c.nk) ?? []).map((p) => `\`${p.okey}\``).join(', ') || 'no bka person';
const merged = []; const noCard = []; let unknownTotal = 0; let genericTotal = 0;
for (const [okey, rows] of rowsByPerson) {
  const p = persons.get(okey);
  const own = cardsByName.get(nameKey(p.firstName, p.lastName)) ?? [];
  if (!own.length) { noCard.push({ p, rows: rows.length, sources: [...new Set(rows.flatMap((r) => (cardsByKey.get(rowKey(r)) ?? []).map((c) => c.name)))] }); continue; }
  const ownKeys = new Set(own.flatMap((c) => [...c.keys]));
  const ownBdays = new Set(own.map((c) => c.bday).filter(Boolean));
  const foreign = new Map(); // source cards (one or a few sharing the value) → rows
  const add = (src, label) => { const id = src.map((c) => `${c.name} → ${target(c)}`).join('<br>'); (foreign.get(id) ?? foreign.set(id, []).get(id)).push(label); };
  for (const r of rows) {
    const k = rowKey(r);
    if (!k) continue;
    if (k.startsWith('d:')) {
      if (!ownBdays.size || ownBdays.has(k.slice(2))) continue;
      const src = cards.filter((c) => c.bday === k.slice(2) && !own.includes(c));
      if (src.length && src.length <= maxShared) add(src, `dob ${k.slice(2)}`);
      continue;
    }
    if (ownKeys.has(k)) continue;
    const src = cardsByKey.get(k) ?? [];
    if (!src.length) { unknownTotal++; continue; }
    if (src.length > maxShared) { genericTotal++; continue; }
    add(src, `${r.get('addressChannel')} ${rowLabel(r)}`);
  }
  if (foreign.size) merged.push({ p, rows: rows.length, foreign, foreignCount: [...foreign.values()].reduce((n, l) => n + l.length, 0) });
}
merged.sort((a, b) => b.foreignCount - a.foreignCount);

const lines = [
  `# vCard import audit against the backup — tenant ${tenantId}, rows created ${day}`, '',
  `Backup: ${path.basename(vcfPath)}, ${cards.length} cards · bka persons: ${persons.size} · rows created that day: ${newRows}`,
  `Persons holding rows from another card: ${merged.length} · persons without a card of their name: ${noCard.length} · rows on no card: ${unknownTotal} · generic values skipped (on > ${maxShared} cards): ${genericTotal}`, '',
  '## Rows that came from another card', '',
  '| Person | okey | new rows | foreign rows | from card → bka person | rows |',
  '| --- | --- | --- | --- | --- | --- |',
  ...merged.flatMap((m) => [...m.foreign].map(([src, list], i) =>
    `| ${i ? '' : `${m.p.firstName} ${m.p.lastName}`} | ${i ? '' : `\`${m.p.okey}\``} | ${i ? '' : m.rows} | ${list.length} | ${src} | ${list.join('<br>')} |`)),
  '', '## Persons without a card of their name (rows not judged)', '',
  '| Person | okey | new rows | cards holding these values |', '| --- | --- | --- | --- |',
  ...noCard.sort((a, b) => b.rows - a.rows).map((n) => `| ${n.p.firstName} ${n.p.lastName} | \`${n.p.okey}\` | ${n.rows} | ${n.sources.join(', ') || '—'} |`),
  '',
];
if (outPath) { writeFileSync(outPath, lines.join('\n')); console.log(`✔ ${merged.length} merged, ${noCard.length} without card → ${outPath}`); }
else console.log(lines.join('\n'));
