/**
 * Spike for spec 1.93 §5.1 — does a push that SHOWS a notification and closes it at once
 * survive on iOS (and Firefox), or does the browser treat it as silent and revoke the push
 * subscription?
 *
 * WHAT: sends `--count` `badge-sync` pushes (`badgeChat` counting down to 0), `--interval`
 * seconds apart, to every registered device of ONE account, then one normal visible push.
 * The service worker shows each sync push under `--tag` (default 'badge-sync'), closes it at
 * once and writes the badge from its ledger (spec 1.93 §2).
 *
 * HOW TO READ THE RESULT (Home Screen app CLOSED, opened once after the release first so the
 * ledger exists):
 *   - per sync push: no banner, no sound, nothing left in Notification Center
 *   - the badge follows badgeChat + the other parts
 *   - the final normal push ARRIVES  → Safari did not revoke the subscription
 * A `registration-token-not-registered` failure during the run = revoked = spike failed.
 *
 * Run with:  node scripts/badge-sync-spike.mjs --uid <uid> --tenant <tenantId> --dry
 *            node scripts/badge-sync-spike.mjs --uid <uid> --tenant <tenantId> [--count 20] [--interval 10] [--tag <roomId>]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Use a test account. Token values are never printed (the doc id IS the token).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

const uid = arg('uid');
const tenantId = arg('tenant');
const count = Number.parseInt(arg('count', '20'), 10);
const intervalMs = Number.parseInt(arg('interval', '10'), 10) * 1000;
const tag = arg('tag', 'badge-sync');
const DRY_RUN = process.argv.includes('--dry');

if (!uid || !tenantId) {
  console.error('usage: node scripts/badge-sync-spike.mjs --uid <uid> --tenant <tenantId> [--count 20] [--interval 10] [--tag <roomId>] [--dry]');
  process.exit(1);
}

const tokensSnap = await getFirestore().collection('users').doc(uid).collection('fcmTokens').get();
const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
console.log(`account ${uid}: ${tokens.length} registered device(s)`);
if (tokens.length === 0 || DRY_RUN) process.exit(0);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(data, label) {
  const response = await getMessaging().sendEachForMulticast({ tokens, data });
  const codes = response.responses.filter((r) => !r.success).map((r) => r.error?.code ?? 'unknown');
  console.log(`${new Date().toISOString()} ${label}: ok=${response.successCount} failed=${response.failureCount}${codes.length ? ` (${codes.join(', ')})` : ''}`);
  return codes.includes('messaging/registration-token-not-registered');
}

for (let i = 0; i < count; i++) {
  const badgeChat = String(Math.max(0, count - 1 - i));
  const revoked = await send({ type: 'badge-sync', tenantId, badgeChat, tag }, `sync ${i + 1}/${count} badgeChat=${badgeChat}`);
  if (revoked) {
    console.log('SPIKE FAILED: a subscription was revoked during the run.');
    process.exit(2);
  }
  await sleep(intervalMs);
}

const revoked = await send({
  type: 'chat',
  tenantId,
  title: 'Spike 1.93',
  body: 'Normale Nachricht nach den Sync-Pushes — kommt sie an?',
  url: '/',
}, 'final visible push');
console.log(revoked
  ? 'SPIKE FAILED: the subscription was revoked.'
  : 'Sent. Check on the device: did the final banner arrive, and were the sync pushes invisible and silent?');
