/**
 * ONE-TIME DATA FIX — sets `senderName` of every existing Mitteilung (`notices`) to the From address
 * its Versand left under, as onMailing does for new notices since 2026-11-19.
 *
 * WHY: before that, a notice carried the display name (or login email) of the person who pressed Send,
 * e.g. `barbara@bkaiser.ch`, while the mail went out as `kommunikation@seeclub.org`.
 *
 * HOW: the value is computed exactly as onMailing computes it: the stored `mailings/{mailingKey}.from`,
 * checked by `effectiveSender` against the tenant's sending domain (falling back to the tenant's
 * sender), then reduced to the bare address by `noticeSenderOf`.
 *
 * SAFETY: `senderName` is the ONLY field written. A notice without a readable Versand is reported and
 * skipped. A notice that already has the right value is skipped. Batches of 400.
 * The old values are printed per notice, so the run log is the undo record.
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/backfill-notice-sender.ts --bundle --platform=node --packages=external \
 *     --format=cjs --outfile=dist/scripts/backfill-notice-sender.cjs
 *   node dist/scripts/backfill-notice-sender.cjs            # dry run
 *   node dist/scripts/backfill-notice-sender.cjs --apply
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { effectiveSender, getAppEmailConfig } from '../apps/functions/src/auth/email-templates';
import { noticeSenderOf } from '../apps/functions/src/email/notice-sender.logic';

const apply = process.argv.includes('--apply');
const BATCH_SIZE = 400;

async function main(): Promise<void> {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  const notices = await db.collection('notices').get();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${notices.size} notices\n`);

  const configs = new Map<string, Awaited<ReturnType<typeof getAppEmailConfig>>>();
  const todo: { ref: FirebaseFirestore.DocumentReference; value: string }[] = [];
  const changes = new Map<string, number>();
  let same = 0;
  let skipped = 0;

  for (const doc of notices.docs) {
    const notice = doc.data();
    const tenantId = Array.isArray(notice['tenants']) && notice['tenants'].length === 1 ? String(notice['tenants'][0]) : '';
    const mailingKey = String(notice['mailingKey'] ?? '');
    const mailing = mailingKey ? (await db.collection('mailings').doc(mailingKey).get()).data() : undefined;
    if (!tenantId || !mailing) {
      console.log(`  SKIP ${doc.id}: ${!tenantId ? 'no single tenant' : `Versand ${mailingKey || '(none)'} not found`}`);
      skipped++;
      continue;
    }
    if (!configs.has(tenantId)) configs.set(tenantId, await getAppEmailConfig(tenantId));
    const value = noticeSenderOf(effectiveSender(mailing['from'], configs.get(tenantId)!));
    const old = String(notice['senderName'] ?? '');
    if (!value || value === old) { same++; continue; }
    console.log(`  ${tenantId} ${doc.id} ${notice['sentAt'] ?? ''}: "${old}" → "${value}"`);
    const label = `${tenantId}: "${old}" → "${value}"`;
    changes.set(label, (changes.get(label) ?? 0) + 1);
    todo.push({ ref: doc.ref, value });
  }

  console.log(`\nSummary: ${todo.length} to change, ${same} already right, ${skipped} skipped`);
  for (const [label, count] of changes) console.log(`  ${count} × ${label}`);

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    return;
  }
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const { ref, value } of todo.slice(i, i + BATCH_SIZE)) batch.update(ref, { senderName: value });
    await batch.commit();
  }
  console.log(`\nWrote ${todo.length} notices.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
