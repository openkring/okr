/**
 * ONE-TIME DATA MIGRATION (spec 1.108, D4) — gives every existing `member-fees` row the club's
 * books: `accountingTenantId: 'scs'`.
 *
 * WHY: from spec 1.108 on, a fee row belongs to one set of books (`accountingTenantId`). The
 * client lists, `postMemberFees` posts and the 1.105 fee-row rebuild touches only rows of the
 * selected books, and a row with `accountingTenantId === ''` (or missing) is ignored everywhere
 * (D11) — it never silently counts as scs. Every row that exists today is the club's (scs), so
 * this script stamps them once. Rollout order (D11): indexes → THIS migration → functions + app.
 *
 * WHAT IT CHANGES: only rows whose `tenants` is exactly `['scs']` and whose `accountingTenantId`
 * is missing or `''`. Only that one field is written (`update()`, never `set()`), archived rows
 * included (an archived row must not reappear in the wrong books if it is ever restored).
 *
 * WHAT IT REFUSES: a row without books whose `tenants` is anything other than `['scs']` is listed
 * and NOT changed — its books cannot be inferred, a person decides.
 *
 * IDEMPOTENT: a row that already has books is counted and skipped, so a re-run changes nothing.
 * Writes go in batches of 400 (the Firestore cap is 500).
 *
 * Usage:
 *   node scripts/migrate-member-fees-books.mjs            # dry run (default): counts, nothing written
 *   node scripts/migrate-member-fees-books.mjs --apply    # write accountingTenantId: 'scs'
 *   node scripts/migrate-member-fees-books.mjs --help
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

const COLLECTION = 'member-fees';
const BOOKS = 'scs';
const TENANT = 'scs';
const BATCH_SIZE = 400;

const HELP = `migrate-member-fees-books — spec 1.108 D4: set accountingTenantId '${BOOKS}' on the existing ${COLLECTION} rows

Usage:
  node scripts/migrate-member-fees-books.mjs            dry run (default): print counts, write nothing
  node scripts/migrate-member-fees-books.mjs --apply    write accountingTenantId: '${BOOKS}'
  node scripts/migrate-member-fees-books.mjs --help     this text

Changes only rows with tenants = ['${TENANT}'] and accountingTenantId missing or ''.
Rows without books in any other tenant are listed and left unchanged. Idempotent.
Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).`;

/** The plan for one row: 'already' (has books), 'stamp' (scs row without books), 'refuse' (other tenant). */
function planRow(data) {
  const books = typeof data.accountingTenantId === 'string' ? data.accountingTenantId : '';
  if (books !== '') return 'already';
  const tenants = Array.isArray(data.tenants) ? data.tenants : [];
  return tenants.length === 1 && tenants[0] === TENANT ? 'stamp' : 'refuse';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const unknown = args.filter(a => a !== '--apply' && a !== '--dry-run');
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(' ')}\n\n${HELP}`);
    process.exit(2);
  }
  const apply = args.includes('--apply');

  // Loaded only after --help, so the help text works without credentials or a network.
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const snapshot = await db.collection(COLLECTION).get();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${COLLECTION}.accountingTenantId → '${BOOKS}' · ${snapshot.size} rows in the collection\n`);

  const todo = [];
  const refused = [];
  const alreadyPerBooks = {};
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const plan = planRow(data);
    if (plan === 'already') {
      alreadyPerBooks[data.accountingTenantId] = (alreadyPerBooks[data.accountingTenantId] ?? 0) + 1;
    } else if (plan === 'stamp') {
      todo.push(doc.ref);
    } else {
      refused.push({ id: doc.id, tenants: data.tenants, member: data.member?.label ?? data.member?.key ?? '' });
    }
  }

  for (const [books, count] of Object.entries(alreadyPerBooks).sort()) {
    console.log(`  already has books ${books.padEnd(8)} ${count}`);
  }
  console.log(`\n  to stamp '${BOOKS}': ${todo.length} · already with books: ${snapshot.size - todo.length - refused.length} · refused (not tenant '${TENANT}'): ${refused.length}`);
  if (refused.length > 0) {
    console.log('\n  NOT changed — rows without books outside tenant scs (a person decides their books):');
    for (const r of refused) console.log(`    ${r.id}  tenants=${JSON.stringify(r.tenants ?? null)}  ${r.member}`);
  }

  if (apply) {
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = db.batch();
      // update(), not set(): only this field is written, everything else is left untouched.
      todo.slice(i, i + BATCH_SIZE).forEach((ref) => batch.update(ref, { accountingTenantId: BOOKS }));
      await batch.commit();
      console.log(`  committed ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
    }
    console.log(`\nstamped: ${todo.length}`);
  } else {
    console.log('\nRe-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
