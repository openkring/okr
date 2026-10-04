/**
 * Take bexio's yearly opening bookings ("Saldovortrag 1.1.yyyy", against 9100 Eröffnungsbilanz) out of
 * the reports of a ledger that was migrated from bexio (spec 1.68 §4.3 step 5).
 *
 * WHY: bexio keeps one book per year — each year opens with a Saldovortrag that carries every balance-
 * sheet account in against 9100. okr keeps ONE continuous ledger: the Bilanz sums every posted line from
 * the start, so the carry-over is implicit and each yearly Saldovortrag counts that year's balances a
 * second time. The daily API sync (`syncBexioJournal`) imported them unfiltered (the CSV journal import
 * skips them). Measured 2026-10-04 for scs: 8 batches 2019–2026, ~15 bookings each, no closing rows.
 * Each batch nets to 0 on 9100, so the ER is unaffected; only the Bilanz is inflated.
 *
 * WHAT IT DOES: sets `status: 'cancelled'` on every Saldovortrag booking EXCEPT the earliest batch —
 * that one is the real opening balance of the ledger and stays posted. Reports count `posted` only, so
 * nothing else is needed. Nothing is deleted (GebüV; the bookings stay visible in the journal), and a
 * dated note carrying MARKER is appended so `--revert` can find exactly these bookings again.
 * If posted bookings exist BEFORE the first Saldovortrag, the first batch double-counts too: the script
 * says so and `--include-first` cancels it as well.
 *
 * LOCKED PERIODS: the Admin SDK bypasses the period lock (enforced in the booking Cloud Functions only).
 * That is intended here — this corrects the migrated history, it does not post new business.
 * RE-SYNC: `journalBookingDoc` writes `status: 'posted'`, so a bexio journal sync would undo this. The
 * scheduler skips tenants whose backend is not bexio; do not run `syncBexioJournal` by hand afterwards.
 *
 * Run with:  node scripts/cancel-bexio-opening-bookings.mjs                    (dry run, tenant scs)
 *            node scripts/cancel-bexio-opening-bookings.mjs --apply
 *            node scripts/cancel-bexio-opening-bookings.mjs --revert [--apply]
 *            options: --tenant <accountingTenantId>  --include-first
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: an already cancelled booking is reported as '=' and not written again.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const OPENING_ACCOUNT = '9100';
const OPENING_TITLE = /^Saldovortrag\b/;
const MARKER = '[bexio-opening-duplicate]';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const apply = args.includes('--apply');
const revert = args.includes('--revert');
const includeFirst = args.includes('--include-first');
const tenant = arg('--tenant') ?? 'scs';

const chf = (cents) => (cents / 100).toLocaleString('de-CH', { minimumFractionDigits: 2 });
const amountOf = (money) => money?.amount ?? 0;
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

async function commitInChunks(db, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, patch] of writes.slice(i, i + 400)) batch.set(ref, patch, { merge: true });
    await batch.commit();
  }
}

async function main() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${revert ? 'revert' : 'cancel'} · accountingTenantId=${tenant}\n`);

  // 1. the 9100 account(s) of this ledger — okeys differ per chart (bexio: scs0277, seeded: {acct}-9100)
  const accounts = await db.collection('accounts')
    .where('accountingTenantId', '==', tenant).where('id', '==', OPENING_ACCOUNT).get();
  const accountKeys = accounts.docs.map((d) => d.id);
  if (!accountKeys.length) { console.error(`no account ${OPENING_ACCOUNT} for ${tenant}`); process.exit(1); }

  // 2. every line on 9100, and their booking headers
  const lineSnaps = await Promise.all(accountKeys.map((k) =>
    db.collection('booking-lines').where('accountingTenantId', '==', tenant).where('accountKey', '==', k).get()));
  const lines = lineSnaps.flatMap((s) => s.docs.map((d) => d.data()));
  const bookingKeys = [...new Set(lines.map((l) => l.bookingKey))];
  const headers = bookingKeys.length ? await db.getAll(...bookingKeys.map((k) => db.collection('bookings').doc(k))) : [];
  const bookings = headers.filter((s) => s.exists).map((s) => ({ ref: s.ref, okey: s.id, ...s.data() }));

  const openings = bookings.filter((b) => OPENING_TITLE.test(b.title ?? ''));
  const others = bookings.filter((b) => !OPENING_TITLE.test(b.title ?? ''));
  if (!openings.length) { console.log('no Saldovortrag bookings on 9100 — nothing to do'); return; }

  // 3. per year: count and the net on 9100 (should be 0 — opening = Aktiven − Passiven incl. equity)
  const byYear = new Map();
  for (const b of openings) {
    const y = b.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(b);
  }
  const years = [...byYear.keys()].sort();
  const firstYear = years[0];
  const firstDate = byYear.get(firstYear).map((b) => b.date).sort()[0];
  const netOf = (okeys) => lines.filter((l) => okeys.has(l.bookingKey))
    .reduce((s, l) => s + amountOf(l.debitAmount) - amountOf(l.creditAmount), 0);

  // 4. movements before the first Saldovortrag make the first batch a duplicate as well
  //    (single-field range query, tenant filtered in memory — avoids a composite index)
  const earlier = (await db.collection('bookings').where('date', '<', firstDate).get()).docs
    .map((d) => d.data()).filter((b) => b.accountingTenantId === tenant && b.status === 'posted');

  console.log('year  bookings  status                        net on 9100');
  for (const y of years) {
    const batch = byYear.get(y);
    const counts = batch.reduce((m, b) => ({ ...m, [b.status]: (m[b.status] ?? 0) + 1 }), {});
    const st = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
    const keep = y === firstYear && !includeFirst ? '  <- kept (opening balance of the ledger)' : '';
    console.log(`${y}  ${String(batch.length).padStart(8)}  ${st.padEnd(28)} ${chf(netOf(new Set(batch.map((b) => b.okey)))).padStart(12)}${keep}`);
  }
  if (others.length) console.log(`\n${others.length} other booking(s) on 9100, not touched: ${others.map((b) => `${b.okey} "${b.title}"`).join(', ')}`);
  if (earlier.length && !includeFirst) {
    console.log(`\n! ${earlier.length} posted booking(s) dated before ${firstDate}: the ${firstYear} batch double-counts too. Re-run with --include-first.`);
  } else if (!earlier.length) {
    console.log(`\nok: no posted booking before ${firstDate} — the ${firstYear} batch is the ledger's real opening balance`);
  }

  // 5. the writes
  const writes = [];
  let unchanged = 0;
  if (revert) {
    for (const b of openings.filter((o) => (o.notes ?? '').includes(MARKER))) {
      if (b.status === 'posted') { unchanged++; continue; }
      const notes = (b.notes ?? '').split('\n').filter((l) => !l.includes(MARKER)).join('\n');
      writes.push([b.ref, { status: 'posted', notes }]);
    }
  } else {
    const note = `Storniert ${today()}: bexio-Saldovortrag, im durchgehenden Hauptbuch doppelt gezählt ${MARKER}`;
    for (const b of openings) {
      if (b.date.slice(0, 4) === firstYear && !includeFirst) continue;
      if (b.status === 'cancelled') { unchanged++; continue; }
      if (b.status !== 'posted') { console.log(`  skip ${b.okey}: status ${b.status}`); continue; }
      writes.push([b.ref, { status: 'cancelled', notes: b.notes ? `${b.notes}\n${note}` : note }]);
    }
  }

  console.log(`\n${writes.length} booking(s) to ${revert ? 'restore to posted' : 'cancel'} · ${unchanged} already done (=)`);
  if (!apply) { console.log('nothing written (dry run)'); return; }
  if (!writes.length) return;

  await commitInChunks(db, writes);
  await db.collection('config').doc('bexioMigration').set({
    runs: FieldValue.arrayUnion({
      step: revert ? 'opening-bookings-revert' : 'opening-bookings-cancel',
      finishedAt: new Date().toISOString(),
      counts: { written: writes.length, unchanged, includeFirst },
    }),
  }, { merge: true });
  console.log('written · run recorded in config/bexioMigration');
}

main().catch((err) => { console.error(err); process.exit(1); });
