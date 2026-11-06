/**
 * Replay failed or stuck webhook rows of ONE client.
 *
 * For every `failed` row, and every `received` row older than one hour (an in-flight row is
 * never touched) that is not itself an in-flight replay copy (`replayedAt` under one hour old),
 * this writes a copy as `<originalId>-r<n>` (smallest unused n) with state `received`, no
 * `error`, and `replayOf` (the root id) and `replayedAt`, and marks the original `replayed`.
 * Handlers that must stay idempotent across a replay (Mailtrap) key on `replayOf`. Both writes share one batch,
 * so a crash cannot leave both live. The deployed onWebhookEvent trigger then runs the same
 * handler on the copy. Prints counts only, never payloads.
 *
 * Run with:  node scripts/webhook-replay.mjs --client <id>            (dry run)
 *            node scripts/webhook-replay.mjs --client <id> --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const COLLECTION = 'webhook-events';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ROWS_PER_BATCH = 200; // two writes per row, Firestore allows 500 per batch

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const clientIdx = argv.indexOf('--client');
const CLIENT = clientIdx >= 0 ? argv[clientIdx + 1] : undefined;

if (!CLIENT || CLIENT.startsWith('--')) {
  console.error('usage: node scripts/webhook-replay.mjs --client <id> [--apply]');
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const col = db.collection(COLLECTION);

const failed = await col.where('state', '==', 'failed').where('clientId', '==', CLIENT).get();
const cutoff = Timestamp.fromMillis(Date.now() - ONE_HOUR_MS);
const received = await col.where('state', '==', 'received').where('receivedAt', '<', cutoff).get();
const inFlightCopy = d => {
  const at = d.get('replayedAt');
  return at !== undefined && at.toMillis() >= cutoff.toMillis();
};
const stuck = received.docs.filter(d => d.get('clientId') === CLIENT && !inFlightCopy(d));
const rows = [...failed.docs, ...stuck];

console.log(`client ${CLIENT}: ${failed.size} failed, ${stuck.length} stuck`);

if (!APPLY) {
  console.log(`dry run: ${rows.length} would be replayed. Pass --apply to write.`);
  process.exit(0);
}

const freeCopyId = async originalId => {
  for (let n = 1; ; n++) {
    const id = `${originalId}-r${n}`;
    if (!(await col.doc(id).get()).exists) return id;
  }
};

let replayed = 0;
for (let i = 0; i < rows.length; i += ROWS_PER_BATCH) {
  const batch = db.batch();
  for (const row of rows.slice(i, i + ROWS_PER_BATCH)) {
    const d = row.data();
    batch.create(col.doc(await freeCopyId(row.id)), {
      clientId: d.clientId,
      type: d.type,
      tenants: d.tenants,
      receivedAt: d.receivedAt,
      payload: d.payload,
      expiresAt: d.expiresAt,
      state: 'received',
      replayOf: d.replayOf ?? row.id,
      replayedAt: Timestamp.now(),
    });
    batch.update(row.ref, { state: 'replayed' });
    replayed++;
  }
  await batch.commit();
}
console.log(`replayed ${replayed}`);
