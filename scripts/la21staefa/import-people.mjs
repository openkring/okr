#!/usr/bin/env node
/**
 * Imports the people named on www.la21staefa.ch into the la21staefa app (spec 1.165, plan Task 12):
 * persons, their contact addresses, one responsibility per role, and the group admins.
 *
 *   node scripts/la21staefa/import-people.mjs --people <people.json> [--write]
 *
 * <people.json> is the extraction of the crawl ({ people: [{ firstName, lastName, gender, email, phone, postal,
 * web, roles: [{ groupUrl, role }] }] }). It holds personal data and is NOT part of the repository.
 *
 * Rules:
 *  - A person already in la21staefa with the same first and last name is reused (e.g. Urs Vetsch); nobody is
 *    matched across tenants by name alone. New persons get the model's privacy defaults (name, email, phone,
 *    postal address «restricted»): publishing them on the website needs their consent first (privacy-model).
 *  - gender '' when the site does not say it (a role noun such as «Präsidentin»); never guessed from the name.
 *  - Roles on «verein» become responsibilities of the org (`org.la21staefa`); roles on a group page become
 *    responsibilities of the group, and the person becomes one of the group's admins. Contact/lead roles first,
 *    so admins[0] (the main contact) is the group's contact person.
 *  - No memberships are written: an active group membership creates the person's Matrix account and the group's
 *    chat room (onMembershipWritten) — a separate decision.
 *  - Dry run by default. Create-only: an existing responsibility (same parent, name, person) is kept; admins are
 *    appended, never replaced.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';

/** group page of the old site (path) → group key in the app; 'verein' → the org */
export const GROUP_OF_PATH = {
  'zukunftsbuero-staefa': 'la21staefa_zukunftsburosta', gutwohnenstaefa: 'la21staefa_gutwohneninstaf', smaert: 'la21staefa_smart',
  'btvz-start': 'la21staefa_btvzbauteilezur', 'lokal-und-fair': 'la21staefa_lokalfair', staefnet: 'la21staefa_stafnet',
  'bau-energie-3': 'la21staefa_bauundenergie', 'reparatur-cafe-staefa': 'la21staefa_reparaturcafest', 'oase-kirchbuehl': 'la21staefa_oasekirchbuhl',
  'kiss-staefa-zeitvorsorge': 'la21staefa_kissstafa', 'begegnung-und-integration': 'la21staefa_begegnungintegr',
  'nettswerk-treff': 'la21staefa_begegnungintegr', qatira: 'la21staefa_qatira',
};

/** `group.<key>` / `org.la21staefa` for a role's groupUrl; '' when unknown. Qatira is a group of its own although
 * the old site lists it under Begegnung & Integration: a role naming Qatira belongs there. */
export function parentOf(groupUrl, role = '') {
  if (groupUrl === 'verein') return `org.${T}`;
  if (/qatira/i.test(role) || /\/qatira\//.test(String(groupUrl))) return 'group.la21staefa_qatira';
  const path = String(groupUrl).replace(/^https?:\/\/[^/]+\//, '').split('/')[0];
  const key = GROUP_OF_PATH[path];
  return key ? `group.${key}` : '';
}

/** lead and contact roles come first: the first admin is the group's main contact */
export function rolePriority(role) {
  return /leitung|leiter|kontakt|präsident|koordinator/i.test(role) ? 0 : 1;
}

/** «+41 78 218 02 66» style; '' for anything that is not a Swiss number */
export function normalisePhone(raw) {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '');
  const m = /^(?:\+41|0041|0)(\d{9})$/.exec(digits);
  if (!m) return '';
  const n = m[1];
  return `+41 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

/** an http(s) web address as https; '' otherwise */
export function normaliseWeb(raw) {
  const u = String(raw ?? '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(u)) return '';
  return u.replace(/^http:\/\//i, 'https://');
}

export const avatarOf = (key, p) => ({
  key, name1: p.firstName, name2: p.lastName, modelType: 'person', type: p.gender ?? '', subType: '', label: `${p.firstName} ${p.lastName}`.trim(),
});

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

const address = (parentKey, label, over) => ({
  addressChannel: 'email', addressChannelLabel: '', addressUsage: 'home', addressUsageLabel: '', email: '', phone: '', iban: '',
  ssn: '', dob: '', dod: '', streetName: '', streetNumber: '', addressValue2: '', zipCode: '', city: '', countryCode: '',
  locationKey: '', validFrom: '', validTo: '', url: '', isFavorite: true, isCc: false, isValidated: false, isArchived: false,
  tags: '', notes: 'von www.la21staefa.ch übernommen (1.165)', tenants: [T], parentKey, index: `p:${parentKey} o:${label}`, ...over,
});

async function main() {
  const i = process.argv.indexOf('--people');
  if (i < 0) throw new Error('Usage: node scripts/la21staefa/import-people.mjs --people <people.json> [--write]');
  const write = process.argv.includes('--write');
  const { people } = JSON.parse(readFileSync(resolve(process.argv[i + 1]), 'utf8'));

  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const existing = new Map();
  (await db.collection('persons').where('tenants', 'array-contains', T).get())
    .forEach((d) => existing.set(`${d.get('firstName')} ${d.get('lastName')}`.toLowerCase(), d.id));
  const responsibilities = new Set();
  (await db.collection('responsibilities').where('tenants', 'array-contains', T).get())
    .forEach((d) => responsibilities.add(`${d.get('parentKey')}|${d.get('name')}|${d.get('responsibleAvatar')?.key}`));

  const admins = new Map(); // group key → [{ priority, avatar }]
  let created = 0; let reused = 0; let addr = 0; let resp = 0;
  const from = today();

  for (const p of people) {
    const label = `${p.firstName} ${p.lastName}`.trim();
    let key = existing.get(label.toLowerCase());
    if (key) {
      reused++;
      console.log(`reused       person ${label}`);
    } else {
      const ref = db.collection('persons').doc();
      key = ref.id;
      created++;
      console.log(`${write ? 'creating     ' : 'would create '} person ${label}`);
      if (write) {
        await ref.create({
          firstName: p.firstName, lastName: p.lastName, gender: p.gender ?? '', isArchived: false, tags: '', isDeceased: false, deathYear: '',
          accountTenants: [], isSystem: false, bexioId: '', favZipCode: '', notes: 'von www.la21staefa.ch übernommen (1.165)',
          usageImages: 0, usageDateOfBirth: 1, usagePostalAddress: 1, usageEmail: 1, usagePhone: 1, usageName: 1,
          tenants: [T], index: `n:${p.lastName} fn:${p.firstName}`,
        });
      }
      const parentKey = `person.${key}`;
      const rows = [];
      const phone = normalisePhone(p.phone);
      if (phone) rows.push(address(parentKey, label, { addressChannel: 'phone', phone }));
      if (p.email) rows.push(address(parentKey, label, { addressChannel: 'email', email: p.email.trim() }));
      const web = normaliseWeb(p.web);
      if (web) rows.push(address(parentKey, label, { addressChannel: 'web', addressUsage: 'work', url: web }));
      if (p.postal?.street && p.postal?.zip) {
        const m = /^(.*?)\s+(\d+\w?)$/.exec(p.postal.street.trim());
        rows.push(address(parentKey, label, {
          addressChannel: 'postal', streetName: m ? m[1] : p.postal.street.trim(), streetNumber: m ? m[2] : '',
          zipCode: p.postal.zip, city: p.postal.city ?? '', countryCode: 'CH',
        }));
      }
      for (const row of rows) {
        addr++;
        console.log(`${write ? 'creating     ' : 'would create '}   address ${row.addressChannel}`);
        if (write) await db.collection('addresses').doc().create(row);
      }
    }

    const avatar = avatarOf(key, p);
    for (const r of p.roles ?? []) {
      const parentKey = parentOf(r.groupUrl, r.role);
      if (!parentKey) { console.log(`  ⚠ ${label}: role «${r.role}» on unknown page ${r.groupUrl} — skipped`); continue; }
      const name = String(r.role).trim().slice(0, 100);
      const id = `${parentKey}|${name}|${key}`;
      if (!responsibilities.has(id)) {
        responsibilities.add(id);
        resp++;
        console.log(`${write ? 'creating     ' : 'would create '}   responsibility ${parentKey} «${name}»`);
        if (write) {
          await db.collection('responsibilities').doc().create({
            name, parentKey, responsibleAvatar: avatar, email: '', notes: 'von www.la21staefa.ch übernommen (1.165)',
            delegateValidFrom: '', delegateValidTo: '', validFrom: from, validTo: '99991231', isArchived: false, tenants: [T],
            index: `rn:${label} rk:${key}`,
          });
        }
      }
      if (parentKey.startsWith('group.')) {
        const g = parentKey.slice('group.'.length);
        const list = admins.get(g) ?? [];
        const prio = rolePriority(name);
        const prev = list.find((a) => a.avatar.key === key);
        if (prev) prev.priority = Math.min(prev.priority, prio); else list.push({ priority: prio, avatar });
        admins.set(g, list);
      }
    }
  }

  for (const [g, list] of admins) {
    const ref = db.doc(`groups/${g}`);
    const current = (await ref.get()).get('admins') ?? [];
    const add = list.sort((a, b) => a.priority - b.priority).map((a) => a.avatar).filter((a) => !current.some((c) => c.key === a.key));
    if (add.length === 0) { console.log(`kept         groups/${g}.admins`); continue; }
    console.log(`${write ? 'updating     ' : 'would update '} groups/${g}.admins += ${add.map((a) => a.label).join(', ')}`);
    if (write) await ref.update({ admins: [...current, ...add] });
  }
  console.log(`\npersons: ${created} new, ${reused} reused · addresses: ${addr} · responsibilities: ${resp} · groups with admins: ${admins.size}`);
  if (!write) console.log('Dry run: nothing written. Add --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
