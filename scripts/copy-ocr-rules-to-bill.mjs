/**
 * One-off: copy every OCR rule of usage 'invoice' to a twin of usage 'bill' (spec 1.91 Q3).
 * Deterministic okey `{okey}-bill` -> re-running is a no-op.
 *
 * Run with:  node scripts/copy-ocr-rules-to-bill.mjs            (dry run)
 *            node scripts/copy-ocr-rules-to-bill.mjs --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const apply = process.argv.slice(2).includes('--apply');

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const snap = await db.collection('ocr-rules').where('ocrUsage', '==', 'invoice').get();
let created = 0;
for (const doc of snap.docs) {
  const twin = db.collection('ocr-rules').doc(`${doc.id}-bill`);
  if ((await twin.get()).exists) continue;
  console.log(`${apply ? 'create' : 'would create'} ${twin.id} (${doc.get('party')})`);
  if (apply) await twin.set({ ...doc.data(), ocrUsage: 'bill' });
  created++;
}
console.log(`${created} rule(s) ${apply ? 'created' : 'to create'}`);
