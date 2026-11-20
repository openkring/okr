#!/usr/bin/env node
/**
 * Merges persons created by the la21staefa import into persons that already exist in another tenant
 * (spec 1.165, Task 12; owner, 2026-11-20). Persons are shared across tenants: the existing person joins
 * la21staefa and everything that points at the imported duplicate moves to it.
 *
 *   node scripts/la21staefa/merge-persons.mjs --pair <importedKey>:<existingKey>[:<firstName>] [...] [--write]
 *
 * Per pair:
 *  - the existing person gains the tenant la21staefa; `firstName` (optional) corrects its first name;
 *  - la21staefa addresses, responsibilities (responsibleAvatar), group admins and group memberships of the
 *    imported person move to the existing one (a membership's memberKey change makes onMembershipWritten move
 *    the chat room membership to the existing person);
 *  - the imported person is archived (never deleted), with a note naming the person it was merged into.
 * Only persons the import created (tenants exactly ['la21staefa']) can be merged away. Dry run by default.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';

/** `--pair a:b[:First]` arguments → [{ from, to, firstName }] */
export function parsePairs(argv) {
  const out = [];
  argv.forEach((a, i) => {
    if (a !== '--pair') return;
    const [from, to, firstName] = String(argv[i + 1] ?? '').split(':');
    if (!from || !to || from === to) throw new Error(`bad --pair ${argv[i + 1]}`);
    out.push({ from, to, firstName: firstName || '' });
  });
  return out;
}

/** an avatar pointing at `from` rewritten to the merged person; other avatars unchanged */
export function retarget(avatar, from, to, person) {
  if (!avatar || avatar.key !== from) return avatar;
  const name1 = person.firstName; const name2 = person.lastName;
  return { ...avatar, key: to, name1, name2, type: person.gender || avatar.type || '', label: `${name1} ${name2}`.trim() };
}

/** a group's admins with `from` replaced by `to`; when `to` is already an admin, `from` is just removed */
export function mergeAdmins(admins, from, to, person) {
  const hasTo = admins.some((a) => a.key === to);
  return admins.flatMap((a) => (a.key !== from ? [a] : hasTo ? [] : [retarget(a, from, to, person)]));
}

async function main() {
  const pairs = parsePairs(process.argv);
  if (pairs.length === 0) throw new Error('Usage: node scripts/la21staefa/merge-persons.mjs --pair <importedKey>:<existingKey>[:<firstName>] … [--write]');
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { FieldValue, getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const say = (msg) => console.log(`${write ? '' : '(dry) '}${msg}`);

  for (const { from, to, firstName } of pairs) {
    const fromRef = db.doc(`persons/${from}`); const toRef = db.doc(`persons/${to}`);
    const src = (await fromRef.get()).data(); const dst = (await toRef.get()).data();
    if (!src || !dst) { console.log(`skip ${from} → ${to}: person missing`); continue; }
    if (JSON.stringify(src.tenants) !== JSON.stringify([T])) { console.log(`skip ${from}: not an imported la21staefa-only person`); continue; }
    if (src.isArchived) { console.log(`skip ${from}: already merged`); continue; }
    const person = { ...dst, firstName: firstName || dst.firstName };
    say(`${src.firstName} ${src.lastName} (${from}) → ${person.firstName} ${person.lastName} (${to})`);

    const patch = { tenants: FieldValue.arrayUnion(T) };
    if (firstName && firstName !== dst.firstName) {
      patch.firstName = firstName;
      patch.index = String(dst.index ?? '').replace(/fn:\S+/, `fn:${firstName}`);
    }
    if (write) await toRef.update(patch);

    const addrs = await db.collection('addresses').where('parentKey', '==', `person.${from}`).get();
    for (const a of addrs.docs) { say(`  address ${a.get('addressChannel')}`); if (write) await a.ref.update({ parentKey: `person.${to}` }); }

    const resps = await db.collection('responsibilities').where('tenants', 'array-contains', T).get();
    for (const r of resps.docs) {
      const av = r.get('responsibleAvatar');
      if (av?.key !== from) continue;
      say(`  responsibility «${r.get('name')}»`);
      const next = retarget(av, from, to, person);
      if (write) await r.ref.update({ responsibleAvatar: next, index: `rn:${next.label} rk:${to}` });
    }

    const groups = await db.collection('groups').where('tenants', 'array-contains', T).get();
    for (const g of groups.docs) {
      const admins = g.get('admins') ?? [];
      if (!admins.some((a) => a.key === from)) continue;
      say(`  admin of ${g.get('name')}`);
      if (write) await g.ref.update({ admins: mergeAdmins(admins, from, to, person) });
    }

    const mems = await db.collection('memberships').where('memberKey', '==', from).get();
    for (const m of mems.docs) {
      const dup = (await db.collection('memberships').where('memberKey', '==', to).where('orgKey', '==', m.get('orgKey')).get()).docs
        .some((d) => !d.get('isArchived'));
      say(`  membership ${m.get('orgName')}${dup ? ' (already a member: archived)' : ''}`);
      if (!write) continue;
      if (dup) await m.ref.update({ isArchived: true });
      else {
        await m.ref.update({
          memberKey: to, memberName1: person.firstName, memberName2: person.lastName, memberType: person.gender || '',
          index: `mn:${person.firstName} ${person.lastName} mk:${to} ok:${m.get('orgKey')} on:${m.get('orgName')}`,
        });
      }
    }

    if (write) await fromRef.update({ isArchived: true, notes: `zusammengeführt mit persons/${to} (1.165, 2026-11-20)` });
  }
  if (!write) console.log('Dry run: nothing written. Add --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
