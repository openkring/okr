#!/usr/bin/env node
/**
 * Makes every admin of a la21staefa group an active member of it (spec 1.165, Task 12; owner, 2026-11-20) — what
 * the app does when a group is created (`ensureAllAdminsAreMember`). Each new active group membership makes
 * onMembershipWritten create the person's Matrix account and the group's chat room and join them to it.
 *
 *   node scripts/la21staefa/create-group-memberships.mjs [--write]
 *
 * Create-only: a person who already has a membership in the group (any state) is skipped. Dry run by default.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';

/** an active, open-ended group membership of a person, as the app writes it */
export function membershipOf(group, admin, today) {
  return {
    tenants: [T], isArchived: false, tags: '', notes: 'Admin der Gruppe (1.165)',
    memberKey: admin.key, memberName1: admin.name1, memberName2: admin.name2, memberModelType: 'person',
    memberType: admin.type ?? '', memberNickName: '', memberAbbreviation: '', memberZipCode: '', memberId: '',
    orgKey: group.key, orgName: group.name, orgModelType: 'group',
    dateOfEntry: today, dateOfExit: '99991231', category: 'active', state: 'active', orgFunction: '', order: 1,
    relLog: `${today}:A`, relIsLast: true,
    index: `mn:${admin.name1} ${admin.name2} mk:${admin.key} ok:${group.key} on:${group.name}`,
    memberBexioId: '', memberBirthYear: '', memberDeathYear: '', memberIsDeceased: false,
  };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const day = today();

  const existing = new Set();
  (await db.collection('memberships').where('tenants', 'array-contains', T).where('orgModelType', '==', 'group').get())
    .forEach((d) => existing.add(`${d.get('orgKey')}|${d.get('memberKey')}`));

  let created = 0;
  const groups = await db.collection('groups').where('tenants', 'array-contains', T).get();
  for (const g of groups.docs) {
    const group = { key: g.id, name: g.get('name') };
    if (g.get('isArchived') || (g.get('kind') ?? 'group') !== 'group') continue;
    for (const admin of g.get('admins') ?? []) {
      if (admin.modelType !== 'person' || existing.has(`${group.key}|${admin.key}`)) continue;
      existing.add(`${group.key}|${admin.key}`);
      created++;
      console.log(`${write ? 'creating     ' : 'would create '} ${group.name}: ${admin.label}`);
      if (write) await db.collection('memberships').doc().create(membershipOf(group, admin, day));
    }
  }
  console.log(`\n${created} memberships${write ? ' created' : ' to create'}.`);
  if (!write) console.log('Dry run: nothing written. Add --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
