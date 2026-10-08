/**
 * One-time / idempotent migration of the `task_state` category i18n scope (spec 3.14 A11).
 *
 * WHY: the task libs moved from libs/task/* to libs/project/task/*, so their i18n scope changed from
 * `@task/feature` to `@project/task/feature`. The `task_state` category document(s) (`categories`,
 * `tenants: ['system']` plus any own-tenant copy) store the scope in `i18n`, so the labels would 404.
 *
 * WHAT: rewrites `i18n: '@task/feature'` to `'@project/task/feature'` on every `task_state` category.
 * It also PRINTS (never changes) every i18nTenantOverride / i18nDefault row whose `module` starts with
 * `task/` so an admin can decide whether to re-key them.
 *
 * Run with:  node scripts/migrate-task-state-i18n.mjs --dry     (inspect first)
 *            node scripts/migrate-task-state-i18n.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');

const snap = await db.collection('categories').where('name', '==', 'task_state').get();
let updated = 0;
for (const doc of snap.docs) {
  const i18n = doc.data().i18n ?? '';
  if (i18n !== '@task/feature') {
    console.log(`skip ${doc.id}: i18n=${i18n}`);
    continue;
  }
  console.log(`${doc.id}: @task/feature → @project/task/feature`);
  if (!DRY_RUN) await doc.ref.update({ i18n: '@project/task/feature' });
  updated++;
}
console.log(`${DRY_RUN ? '[DRY RUN] would update' : 'updated'} ${updated} of ${snap.size}`);

// Report only: runtime i18n rows keyed on the old scope (module 'task/feature', 'task/data-access', ...).
// Read-only and after the migration: a failure here (e.g. a missing index) must not look like a failed migration.
for (const collection of ['i18nTenantOverride', 'i18nDefault']) {
  try {
    const rows = await db.collection(collection).where('module', '>=', 'task/').where('module', '<', 'task0').get();
    for (const doc of rows.docs) {
      const d = doc.data();
      console.log(`REVIEW ${collection}/${doc.id}: module=${d.module} key=${d.key} tenantId=${d.tenantId ?? '-'}`);
    }
    console.log(`${collection}: ${rows.size} row(s) with module task/*  (not changed)`);
  } catch (error) {
    console.warn(`${collection}: could not list rows with module task/* (${error?.message ?? error}) — check them by hand`);
  }
}
