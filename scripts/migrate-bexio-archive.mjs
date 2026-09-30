/**
 * One-off export of the scs books from bexio into okr (spec 1.68 §4.2, plan
 * planning/plans/2026-09-29-bexio-to-native-migration-plan.md).
 *
 *   export BEXIO_APIKEY="$(gcloud secrets versions access latest --secret=BEXIO_APIKEY --project=bkaiser-org)"
 *   node scripts/migrate-bexio-archive.mjs --step journal-reconcile --dry
 *   node scripts/migrate-bexio-archive.mjs --step journal-reconcile
 *
 * Order: journal-reconcile · invoices-reconcile · bills-full · probe-vouchers (read-only) · files ·
 * link-vouchers · invoice-details · bill-payments. Every step is idempotent (deterministic okeys).
 * Each applied run appends its counts to config/bexioMigration.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { argv, env, exit } from 'node:process';
import { createBexioClient } from './bexio-archive/client.mjs';
import { STEPS } from './bexio-archive/steps.mjs';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const step = arg('--step');
const dry = argv.includes('--dry');
const force = argv.includes('--force');   // overrides the delete guards (spec 1.68 review finding 1)

if (!env.BEXIO_APIKEY) { console.error('BEXIO_APIKEY is not set'); exit(1); }
if (!step || !STEPS[step]) { console.error(`--step must be one of: ${Object.keys(STEPS).join(', ')}`); exit(1); }

if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
const db = getFirestore();
// vouchers and PDFs go to the private bucket (not an imgix source, not Firebase-linked) — spec private media bucket
const ctx = { db, bucket: getStorage().bucket(`${PROJECT_ID}-private`), bexio: createBexioClient({ token: env.BEXIO_APIKEY }), tenantId: TENANT, dry, force };

const startedAt = new Date().toISOString();
const counts = await STEPS[step](ctx);
console.log(JSON.stringify({ step, dry, force, counts }, null, 2));
if (!dry) {
  await db.collection('config').doc('bexioMigration').set(
    { runs: FieldValue.arrayUnion({ step, startedAt, finishedAt: new Date().toISOString(), counts }) }, { merge: true });
}
