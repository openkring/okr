/**
 * One-off: resolves the 13 individual 2026 cases scripts/link-bexio-ledger.mjs could not match, as
 * decided by the treasurer on 2026-10-05. Every operation is spelled out below; nothing is matched.
 *
 * A — links and notes (no ledger change):
 *   REA-01625, REA-01628  cancelled 11.01.2026 (Ausschluss wegen Nichtzahlung per 31.12.2025):
 *                         link bexio's reversal rows 10702–10704 / 10705–10707
 *   REA-01789             cancelled 17.04.2026 (Austritt): link reversal 11475
 *   REA-01776/1792/1795/1806/1808  paid by GS 17.04.2026: payments → 11476/11477/11478/11479/11481
 *   bills 00922/00957/00987        bill and payment bookings; 00922's payment date → 19.05.2026 (booking 11483)
 * B — ledger corrections:
 *   11482  debit 4200 Aufwand Tenüs → 4010 Anschaffung Boote (00922)
 *   11849  CHF 3'732.75 → 3'315.18 (EUR 3'555 at the paid rate); 11851 "Kursgewinn" 417.57 cancelled (00957)
 *   12024  CHF 14'564.36 → 14'778.49 (EUR 15'494 at the paid rate); 12044 "Kursverlust" 214.13 cancelled (00987)
 *   4010 nets to the CHF actually paid in both cases (unchanged), Kreditoren to 0; only the bogus FX rows go.
 *
 * Every current value is checked before it is changed (a mismatch aborts the whole run, an already
 * applied value counts as '='). Touched bookings get a dated note with MARKER. Before writing, the
 * previous state of every touched document is saved to config/bexioCorrection-2026-10-05, which
 * `--revert` restores verbatim. The Admin SDK bypasses writeBooking; 2026 is not locked.
 *
 * Run with:  node scripts/resolve-bexio-2026-cases.mjs            (dry run)
 *            node scripts/resolve-bexio-2026-cases.mjs --apply
 *            node scripts/resolve-bexio-2026-cases.mjs --revert [--apply]
 * Requires:  gcloud auth application-default login
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const MARKER = '[bexio-correction-2026]';
const LINK_MARKER = '[bexio-ledger-link]';
const SNAPSHOT = 'config/bexioCorrection-2026-10-05';
const DAY = '05.10.2026';

const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

const INVOICE_CANCELS = [
  { invoiceId: 'REA-01625', bookings: ['10702', '10703', '10704'], note: 'Storniert 11.01.2026: Ausschluss wegen Nichtzahlung per 31.12.2025' },
  { invoiceId: 'REA-01628', bookings: ['10705', '10706', '10707'], note: 'Storniert 11.01.2026: Ausschluss wegen Nichtzahlung per 31.12.2025' },
  { invoiceId: 'REA-01789', bookings: ['11475'], note: 'Storniert per 17.04.2026 wegen Austritt' },
];
const INVOICE_PAYMENTS = [
  { invoiceId: 'REA-01776', date: '20260417', amount: 7500, booking: '11476' },
  { invoiceId: 'REA-01792', date: '20260417', amount: 7500, booking: '11477' },
  { invoiceId: 'REA-01795', date: '20260417', amount: 7500, booking: '11478' },
  { invoiceId: 'REA-01806', date: '20260417', amount: 7500, booking: '11479' },
  { invoiceId: 'REA-01808', date: '20260417', amount: 7500, booking: '11481' },
];
const BILLS = [
  { billId: '00922', bookings: ['11482'], payment: { amount: 99000, booking: '11483', date: '20260519' } },
  { billId: '00957', bookings: ['11849', '11851'], payment: { amount: 355500, booking: '11850' } },
  { billId: '00987', bookings: ['12024', '12044'], payment: { amount: 1549400, booking: '12043' } },
];
const ACCOUNT_CHANGES = [{ booking: '11482', side: 'debit', from: '4200', to: '4010', note: 'Konto 4200 → 4010 (Bootsmiete, nicht Tenüs)' }];
const AMOUNT_CHANGES = [
  { booking: '11849', from: 373275, to: 331518, note: 'CHF 3’732.75 → 3’315.18: EUR 3’555 zum bezahlten Kurs (falscher Kurs in bexio)' },
  { booking: '12024', from: 1456436, to: 1477849, note: 'CHF 14’564.36 → 14’778.49: EUR 15’494 zum bezahlten Kurs' },
];
const CANCELS = [
  { booking: '11851', amount: 41757, note: 'Storniert: Kursgewinn aus falschem Kurs in 11849, dort korrigiert' },
  { booking: '12044', amount: 21413, note: 'Storniert: Kursverlust in 12024 einbezogen (Anschaffung zum bezahlten Betrag)' },
];

const fail = (msg) => { throw new Error(`abort, nothing written: ${msg}`); };
const appendNote = (notes, line) => (notes ? `${notes}\n${line}` : line);

async function main() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${revert ? 'revert' : 'resolve'} · ${TENANT}\n`);

  if (revert) {
    const snap = (await db.doc(SNAPSHOT).get()).data();
    if (!snap?.docs) { console.log('no snapshot — nothing to revert'); return; }
    console.log(`${Object.keys(snap.docs).length} document(s) to restore from ${SNAPSHOT}`);
    if (!apply) { console.log('nothing written (dry run)'); return; }
    const batch = db.batch();
    for (const [path, data] of Object.entries(snap.docs)) batch.set(db.doc(path), JSON.parse(data));
    batch.delete(db.doc(SNAPSHOT));
    await batch.commit();
    console.log('restored');
    return;
  }

  const accounts = new Map((await db.collection('accounts').where('accountingTenantId', '==', TENANT).get()).docs.map((d) => [d.data().id, d.id]));
  const writes = new Map();   // path -> { ref, before, patch }
  const touch = async (ref) => {
    if (!writes.has(ref.path)) {
      const s = await ref.get();
      if (!s.exists) fail(`${ref.path} does not exist`);
      writes.set(ref.path, { ref, before: s.data(), patch: {} });
    }
    return writes.get(ref.path);
  };
  const byField = async (collection, field, value) => {
    const s = await db.collection(collection).where(field, '==', value).get();
    const docs = s.docs.filter((d) => d.data().accountingTenantId === TENANT);
    if (docs.length !== 1) fail(`${collection} ${field}=${value}: ${docs.length} documents`);
    return docs[0].ref;
  };
  const posted = async (key) => {
    const w = await touch(db.doc(`bookings/${key}`));
    if (w.before.accountingTenantId !== TENANT || !['posted', 'cancelled'].includes(w.before.status)) fail(`booking ${key} is ${w.before.status}`);
    return w;
  };
  const counterpartyOn = async (key, who, label) => {
    const w = await posted(key);
    if (who?.key && !w.before.counterparty?.key && !w.patch.counterparty) {
      w.patch.counterparty = who;
      w.patch.notes = appendNote(w.patch.notes ?? w.before.notes, `Gegenpartei ${DAY} aus ${label} übernommen ${LINK_MARKER}`);
    }
  };
  const log = [];

  // A — invoices cancelled in bexio: link the reversal rows, record the reason
  for (const c of INVOICE_CANCELS) {
    const w = await touch(await byField('invoices', 'invoiceId', c.invoiceId));
    if (w.before.state !== 'cancelled') fail(`${c.invoiceId} is ${w.before.state}, expected cancelled`);
    const keys = w.before.bookingKeys ?? [];
    const add = c.bookings.filter((k) => !keys.includes(k));
    if (add.length) w.patch.bookingKeys = [...keys, ...add];
    if (!(w.before.notes ?? '').includes(c.note)) w.patch.notes = appendNote(w.before.notes, c.note);
    for (const k of c.bookings) await counterpartyOn(k, w.before.receiver, `Rechnung ${c.invoiceId}`);
    log.push(`${c.invoiceId}: +${add.join(', ') || '='} · note`);
  }
  // A — GS payments of 17.04.2026
  for (const p of INVOICE_PAYMENTS) {
    const w = await touch(await byField('invoices', 'invoiceId', p.invoiceId));
    const payments = (w.before.payments ?? []).map((x) => ({ ...x }));
    const i = payments.findIndex((x) => x.date === p.date && x.amount === p.amount);
    if (i < 0) fail(`${p.invoiceId}: no payment ${p.date} ${p.amount}`);
    if (payments[i].bookingKey && payments[i].bookingKey !== p.booking) fail(`${p.invoiceId}: payment already linked to ${payments[i].bookingKey}`);
    if (payments[i].bookingKey !== p.booking) { payments[i].bookingKey = p.booking; w.patch.payments = payments; }
    await counterpartyOn(p.booking, w.before.receiver, `Rechnung ${p.invoiceId}`);
    log.push(`${p.invoiceId}: payment → ${p.booking}`);
  }
  // A — bills: own bookings and the payment
  for (const b of BILLS) {
    const w = await touch(await byField('bills', 'billId', b.billId));
    const keys = w.before.bookingKeys ?? [];
    const add = b.bookings.filter((k) => !keys.includes(k));
    if (add.length) w.patch.bookingKeys = [...keys, ...add];
    const payments = (w.before.payments ?? []).map((x) => ({ ...x }));
    const i = payments.findIndex((x) => x.amount === b.payment.amount);
    if (i < 0 || payments.filter((x) => x.amount === b.payment.amount).length > 1) fail(`${b.billId}: payment ${b.payment.amount} not unique`);
    if (payments[i].bookingKey && payments[i].bookingKey !== b.payment.booking) fail(`${b.billId}: payment already linked to ${payments[i].bookingKey}`);
    payments[i].bookingKey = b.payment.booking;
    if (b.payment.date) {
      payments[i].date = b.payment.date;
      if (w.before.paymentDate !== b.payment.date) w.patch.paymentDate = b.payment.date;
    }
    if (JSON.stringify(payments) !== JSON.stringify(w.before.payments ?? [])) w.patch.payments = payments;
    for (const k of [...b.bookings, b.payment.booking]) await counterpartyOn(k, w.before.vendor, `Kreditor ${b.billId}`);
    log.push(`bill ${b.billId}: +${add.join(', ') || '='} · payment → ${b.payment.booking}${b.payment.date ? ` · date ${b.payment.date}` : ''}`);
  }

  // B — ledger corrections on the booking lines
  const linesOf = async (key) => (await db.collection('booking-lines').where('bookingKey', '==', key).get()).docs
    .filter((d) => d.data().accountingTenantId === TENANT && d.data().isArchived !== true);
  for (const c of ACCOUNT_CHANGES) {
    const from = accounts.get(c.from), to = accounts.get(c.to);
    if (!from || !to) fail(`account ${c.from} / ${c.to} missing`);
    const lines = (await linesOf(c.booking)).filter((d) => (c.side === 'debit' ? d.data().debitAmount?.amount : d.data().creditAmount?.amount));
    if (lines.length !== 1) fail(`booking ${c.booking}: ${lines.length} ${c.side} lines`);
    const w = await touch(lines[0].ref);
    if (w.before.accountKey === to) { log.push(`${c.booking}: account already ${c.to} (=)`); continue; }
    if (w.before.accountKey !== from) fail(`booking ${c.booking}: ${c.side} account is ${w.before.accountKey}, expected ${from}`);
    w.patch.accountKey = to;
    const b = await posted(c.booking);
    b.patch.notes = appendNote(b.patch.notes ?? b.before.notes, `Korrigiert ${DAY}: ${c.note} ${MARKER}`);
    log.push(`${c.booking}: ${c.side} ${c.from} → ${c.to}`);
  }
  for (const c of AMOUNT_CHANGES) {
    const lines = await linesOf(c.booking);
    if (lines.length !== 2) fail(`booking ${c.booking}: ${lines.length} lines, expected 2`);
    let changed = false;
    for (const d of lines) {
      const w = await touch(d.ref);
      const side = w.before.debitAmount?.amount ? 'debitAmount' : 'creditAmount';
      const amount = w.before[side].amount;
      if (amount === c.to) continue;
      if (amount !== c.from) fail(`booking ${c.booking}: ${side} ${amount}, expected ${c.from}`);
      w.patch[side] = { ...w.before[side], amount: c.to };
      changed = true;
    }
    if (changed) {
      const b = await posted(c.booking);
      b.patch.notes = appendNote(b.patch.notes ?? b.before.notes, `Korrigiert ${DAY}: ${c.note} ${MARKER}`);
    }
    log.push(`${c.booking}: ${changed ? `${c.from} → ${c.to}` : 'amount already corrected (=)'}`);
  }
  for (const c of CANCELS) {
    const b = await posted(c.booking);
    const lines = await linesOf(c.booking);
    if (!lines.every((d) => (d.data().debitAmount?.amount ?? d.data().creditAmount?.amount) === c.amount)) fail(`booking ${c.booking}: amount is not ${c.amount}`);
    if (b.before.status === 'cancelled') { log.push(`${c.booking}: already cancelled (=)`); continue; }
    b.patch.status = 'cancelled';
    b.patch.notes = appendNote(b.patch.notes ?? b.before.notes, `${DAY} ${c.note} ${MARKER}`);
    log.push(`${c.booking}: cancelled`);
  }

  const changes = [...writes.values()].filter((w) => Object.keys(w.patch).length);
  for (const l of log) console.log(`  ${l}`);
  console.log(`\n${changes.length} document(s) to write`);
  for (const w of changes) console.log(`  ${w.ref.path}: ${Object.keys(w.patch).join(', ')}`);
  if (!apply) { console.log('nothing written (dry run)'); return; }
  if (!changes.length) return;

  const existing = (await db.doc(SNAPSHOT).get()).data()?.docs ?? {};
  const docs = { ...Object.fromEntries(changes.map((w) => [w.ref.path, JSON.stringify(w.before)])), ...existing };  // keep the first snapshot
  await db.doc(SNAPSHOT).set({ docs, takenAt: new Date().toISOString() });
  const batch = db.batch();
  for (const w of changes) batch.set(w.ref, w.patch, { merge: true });
  batch.set(db.doc('config/bexioMigration'), {
    runs: FieldValue.arrayUnion({ step: 'resolve-2026-cases', finishedAt: new Date().toISOString(), counts: { written: changes.length } }),
  }, { merge: true });
  await batch.commit();
  console.log(`written · previous state saved to ${SNAPSHOT}`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
