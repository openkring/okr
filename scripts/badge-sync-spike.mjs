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
 * Tokens that already fail on the FIRST push are stale leftovers (dead before the run) and are
 * dropped. Only a token that accepted an earlier push and then reports
 * `registration-token-not-registered` counts as revoked = spike failed.
 *
 * Run with:  node scripts/badge-sync-spike.mjs --uid <uid> --tenant <tenantId> --dry
 *            node scripts/badge-sync-spike.mjs --uid <uid> --tenant <tenantId> [--only 3,5] [--count 20] [--interval 10] [--tag <roomId>]
 * --dry lists the devices (#, last registered); --only limits the run to those # (e.g. the iPhone).
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
const only = arg('only')?.split(',').map((n) => Number.parseInt(n, 10));
const DRY_RUN = process.argv.includes('--dry');

if (!uid || !tenantId) {
  console.error('usage: node scripts/badge-sync-spike.mjs --uid <uid> --tenant <tenantId> [--only 3,5] [--count 20] [--interval 10] [--tag <roomId>] [--dry]');
  process.exit(1);
}

const tokensSnap = await getFirestore().collection('users').doc(uid).collection('fcmTokens').orderBy('updatedAt', 'desc').get();
const devices = tokensSnap.docs
  .map((d, i) => ({ no: i + 1, token: d.data().token, updatedAt: d.data().updatedAt?.toDate?.().toISOString() ?? '?' }))
  .filter((d) => d.token);
console.log(`account ${uid}: ${devices.length} registered device(s), newest first`);
for (const d of devices) console.log(`  #${d.no}  last registered ${d.updatedAt}  ${d.token.includes(':') ? 'web' : 'native'}`);
let live = only ? devices.filter((d) => only.includes(d.no)) : devices;
if (live.length === 0 || DRY_RUN) process.exit(0);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends to the live devices; returns the devices that failed, with their error code. */
async function send(data, label) {
  const response = await getMessaging().sendEachForMulticast({ tokens: live.map((d) => d.token), data });
  const failed = response.responses
    .map((r, i) => (r.success ? null : { device: live[i], code: r.error?.code ?? 'unknown' }))
    .filter(Boolean);
  console.log(`${new Date().toISOString()} ${label}: ok=${response.successCount} failed=${response.failureCount}${failed.length ? ` (${failed.map((f) => `#${f.device.no} ${f.code}`).join(', ')})` : ''}`);
  return failed;
}

for (let i = 0; i < count; i++) {
  const badgeChat = String(Math.max(0, count - 1 - i));
  const failed = await send({ type: 'badge-sync', tenantId, badgeChat, tag }, `sync ${i + 1}/${count} badgeChat=${badgeChat}`);
  if (i === 0) {
    // dead before the run — not a result of the sync pushes
    if (failed.length) console.log(`  dropping ${failed.length} stale token(s): ${failed.map((f) => `#${f.device.no}`).join(', ')}`);
    live = live.filter((d) => !failed.some((f) => f.device === d));
    if (live.length === 0) {
      console.log('No live device left — open the app on the iPhone once to re-register, then retry.');
      process.exit(1);
    }
  } else if (failed.some((f) => f.code === 'messaging/registration-token-not-registered')) {
    console.log('SPIKE FAILED: a subscription was revoked during the run.');
    process.exit(2);
  }
  await sleep(intervalMs);
}

const failed = await send({
  type: 'chat',
  tenantId,
  title: 'Spike 1.93',
  body: 'Normale Nachricht nach den Sync-Pushes — kommt sie an?',
  url: '/',
}, 'final visible push');
console.log(failed.some((f) => f.code === 'messaging/registration-token-not-registered')
  ? 'SPIKE FAILED: the subscription was revoked.'
  : 'Sent. Check on the device: did the final banner arrive, and were the sync pushes invisible and silent?');
