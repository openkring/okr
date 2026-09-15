/**
 * Prune stale FCM device tokens under users/{uid}/fcmTokens.
 *
 * WHY: a token is written on every app start (FcmService.saveToken, doc id = the token) but
 * only ever deleted when a push to it comes back `registration-token-not-registered`. FCM
 * rotates a device's token (service-worker reinstall, storage eviction, PWA reinstall) without
 * invalidating the old one right away, so one physical device accumulates a tail of dead
 * tokens — measured 2026-09-15: one user with 20 tokens, 11 of them from ONE installation.
 * Every push then fans out to all of them. Since that date `saveToken` also removes the
 * sibling tokens of the same installation; this script is the one-off cleanup for what
 * already piled up.
 *
 * TWO RULES, applied per user:
 *  1. installation: the part of a web token before ':' is the app-instance id. Of several
 *     tokens sharing it only the most recently updated one can be current — the others go.
 *  2. validity: every remaining token gets a DRY-RUN send (`messaging.send(msg, true)` —
 *     validated by FCM, delivered to nobody). `registration-token-not-registered` /
 *     `invalid-registration-token` → delete. Any other error keeps the token (a transient
 *     failure must not strip a working device).
 *
 * Usage:
 *   node scripts/prune-fcm-tokens.mjs --uid <uid>            # one user, dry run
 *   node scripts/prune-fcm-tokens.mjs --uid <uid> --apply
 *   node scripts/prune-fcm-tokens.mjs --all [--apply]         # every user
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const all = args.includes('--all');
const uidArg = args[args.indexOf('--uid') + 1];
if (!all && (!args.includes('--uid') || !uidArg)) {
  console.error('usage: --uid <uid> | --all   [--apply]');
  process.exit(1);
}

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/** The app-instance id of a web token, or the whole token when it has no ':' (native APNs). */
function installationOf(token) {
  const i = token.indexOf(':');
  return i > 0 ? token.slice(0, i) : token;
}

async function isDead(token) {
  try {
    await getMessaging().send({ token, data: { type: 'validate' } }, true);
    return false;
  } catch (err) {
    return DEAD.has(err?.code ?? '');
  }
}

async function pruneUser(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('fcmTokens').get();
  if (snap.empty) return { total: 0, byInstallation: 0, dead: 0 };
  const docs = snap.docs.map((d) => ({
    ref: d.ref,
    token: d.data().token ?? d.id,
    updatedAt: d.data().updatedAt?.toMillis?.() ?? 0,
  }));

  // rule 1: newest per installation
  const newest = new Map();
  for (const d of docs) {
    const key = installationOf(d.token);
    if (!newest.has(key) || newest.get(key).updatedAt < d.updatedAt) newest.set(key, d);
  }
  const superseded = docs.filter((d) => newest.get(installationOf(d.token)) !== d);

  // rule 2: validity of the survivors
  const dead = [];
  for (const d of newest.values()) if (await isDead(d.token)) dead.push(d);

  const remove = [...superseded, ...dead];
  console.log(`${uid}: ${docs.length} token(s) · ${newest.size} installation(s) · superseded ${superseded.length} · dead ${dead.length} → keep ${docs.length - remove.length}`);
  for (const d of superseded) console.log(`   superseded  ${d.token.slice(0, 28)}…  (${new Date(d.updatedAt).toISOString().slice(0, 10)})`);
  for (const d of dead) console.log(`   dead        ${d.token.slice(0, 28)}…`);

  if (apply && remove.length) {
    const batch = db.batch();
    for (const d of remove) batch.delete(d.ref);
    await batch.commit();
  }
  return { total: docs.length, byInstallation: superseded.length, dead: dead.length };
}

async function main() {
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}\n`);

  const uids = all ? (await db.collection('users').select().get()).docs.map((d) => d.id) : [uidArg];
  const sum = { total: 0, byInstallation: 0, dead: 0, users: 0 };
  for (const uid of uids) {
    const r = await pruneUser(db, uid);
    if (r.total === 0) continue;
    sum.users++; sum.total += r.total; sum.byInstallation += r.byInstallation; sum.dead += r.dead;
  }
  console.log(`\n${sum.users} user(s) with tokens · ${sum.total} tokens · superseded ${sum.byInstallation} · dead ${sum.dead}${apply ? ' — deleted' : ' — nothing deleted (dry run)'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
