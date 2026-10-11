/**
 * Seeds the DB side of the daily payment_approver task (spec 1.94): the i18nDefault row that
 * names the task `billApproverDaily` opens (`@workflow.bill.approverDigest`, with {count},
 * {date} and {total}). An override per tenant still wins at runtime — see the i18n skill.
 *
 * Run with:  node scripts/seed-bill-approver-i18n.mjs --dry     (inspect first)
 *            node scripts/seed-bill-approver-i18n.mjs
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the row is matched by (module, key), so a re-run updates rather than duplicates.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const DRY = argv.includes('--dry');
const I18N_MODULE = 'workflow';
const I18N_KEY = 'bill.approverDigest';

const TEXT = {
  de: 'Kreditoren prüfen: {count} gebucht am {date}, total {total} CHF',
  en: 'Review bills: {count} booked on {date}, total CHF {total}',
  fr: 'Vérifie les factures : {count} comptabilisées le {date}, total {total} CHF',
  es: 'Revisa las facturas: {count} contabilizadas el {date}, total {total} CHF',
  it: 'Controlla le fatture: {count} registrate il {date}, totale {total} CHF',
};

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

async function upsertI18nDefault(key, text) {
  const snap = await db.collection('i18nDefault')
    .where('module', '==', I18N_MODULE).where('key', '==', key).limit(5).get();
  const existing = snap.docs.find((d) => !d.data().isArchived);
  // all five supported languages, per the i18n skill — a missing one renders the raw key,
  // Transloco does not fall back to `de`
  const row = { module: I18N_MODULE, key, ...text, isHtml: false, isArchived: false };
  console.log(`  i18nDefault @${I18N_MODULE}.${key} = "${text.de}" ${existing ? '(update)' : '(create)'}`);
  if (DRY) return;
  if (existing) await existing.ref.set(row, { merge: true });
  else await db.collection('i18nDefault').add(row);
}

async function main() {
  console.log(`seed-bill-approver-i18n${DRY ? ' (dry run)' : ''}`);
  await upsertI18nDefault(I18N_KEY, TEXT);
  console.log(DRY ? 'dry run — nothing written' : 'done');
}

main().catch((error) => { console.error(error); exit(1); });
