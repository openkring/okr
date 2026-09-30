/**
 * One-time / idempotent repair of task authors written as USERS instead of PERSONS (spec 1.72 §3.3).
 *
 * WHY: until 2026-09-30 the task quick entry stored `author = { key: <auth uid>, modelType: 'user' }`.
 * Every author check — the UI helpers in @okr/task-util and the Firestore rules of spec 1.72 —
 * compares `author.key` with the caller's personKey, so these authors cannot edit or delete their
 * own tasks, and the tasks are missing from "my tasks". Must run BEFORE the 1.72 rules deploy.
 *
 * WHAT: for every task whose `author` (or `assignee`) has `modelType == 'user'`, looks up
 * `users/{uid}.personKey` and `persons/{personKey}` and rewrites the avatar as a person avatar
 * (key, first/last name, gender, label), then rebuilds `index`. Nothing else is touched; a user
 * without a personKey is reported and skipped. Only `author`, `assignee` and `index` change — none
 * of the fields `onTaskWritten` reads to decide on a push, so no notification fires.
 *
 * AUTHORITATIVE LOGIC: getTaskIndex (libs/task/util/src/lib/task.util.ts) — mirrored below.
 *
 * Run with:  node scripts/repair-task-authors.mjs --dry     (inspect first)
 *            node scripts/repair-task-authors.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');

/** mirror of addIndexElement (@okr/shared-util-core) */
function addIndexElement(index, key, value) {
  if (!key || key.length === 0) return index;
  const v = value ?? '';
  if (typeof v === 'string' && (v.length === 0 || (v.length === 1 && v.startsWith(' ')))) return index;
  return index.length === 0 ? `${key}:${v}` : `${index} ${key}:${v}`;
}

/** mirror of getTaskIndex (@okr/task-util) */
function buildTaskIndex(t) {
  let index = '';
  index = addIndexElement(index, 'n', t.name ?? '');
  if (t.author) {
    index = addIndexElement(index, 'an', t.author.name1 + ' ' + t.author.name2);
    index = addIndexElement(index, 'ak', t.author.key);
  }
  if (t.assignee) {
    index = addIndexElement(index, 'asn', t.assignee.name1 + ' ' + t.assignee.name2);
    index = addIndexElement(index, 'ask', t.assignee.key);
  }
  return index;
}

const personAvatarCache = new Map();

/** uid -> person avatar, or undefined when the user has no (existing) person */
async function personAvatarForUser(uid) {
  if (personAvatarCache.has(uid)) return personAvatarCache.get(uid);
  let avatar;
  const user = await db.collection('users').doc(uid).get();
  const personKey = user.exists ? (user.get('personKey') ?? '') : '';
  if (personKey) {
    const person = await db.collection('persons').doc(personKey).get();
    const firstName = person.exists ? (person.get('firstName') ?? '') : (user.get('firstName') ?? '');
    const lastName = person.exists ? (person.get('lastName') ?? '') : (user.get('lastName') ?? '');
    avatar = {
      key: personKey,
      name1: firstName,
      name2: lastName,
      modelType: 'person',
      type: person.exists ? (person.get('gender') ?? '') : '',
      subType: '',
      label: `${firstName} ${lastName}`,
    };
  }
  personAvatarCache.set(uid, avatar);
  return avatar;
}

const stats = { seen: 0, repaired: 0, skippedNoPerson: 0 };
const samples = [];

const snap = await db.collection('tasks').get();
for (const doc of snap.docs) {
  stats.seen++;
  const task = doc.data();
  const patch = {};
  for (const field of ['author', 'assignee']) {
    const avatar = task[field];
    if (avatar?.modelType !== 'user' || !avatar.key) continue;
    const personAvatar = await personAvatarForUser(avatar.key);
    if (!personAvatar) {
      stats.skippedNoPerson++;
      console.warn(`skip ${doc.id}.${field}: user ${avatar.key} has no personKey`);
      continue;
    }
    patch[field] = personAvatar;
  }
  if (Object.keys(patch).length === 0) continue;
  patch.index = buildTaskIndex({ ...task, ...patch });
  stats.repaired++;
  if (samples.length < 5) samples.push({ id: doc.id, tenants: task.tenants, name: task.name, from: task.author?.key, to: patch.author?.key });
  if (!DRY_RUN) await doc.ref.update(patch);
}

console.log(DRY_RUN ? '[DRY RUN] no writes' : 'written');
console.log(stats);
console.log(samples);
