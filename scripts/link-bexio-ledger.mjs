/**
 * Link the migrated bexio invoices, bills and their payments to their bookings in the synced bexio
 * journal, and give those bookings the invoice's receiver / the bill's vendor as counterparty.
 *
 * WHY: bexio's journal rows carry no reference to their document. After the migration a booking reads
 * "Zahlungseingang" or "(Zahlungsausgang) Belastungen Mobile Banking (3): …" with no hint of who paid,
 * and an invoice or bill cannot show its own bookings (the ledger card in its view modal). okr's own
 * invoices are linked by construction (issueInvoice, recordInvoicePayment); this does the same for the
 * migrated history, once.
 *
 * WHAT IT DOES: an invoice's own bookings come from the bexio journal, which names the invoice of each
 * row (ref_class KbInvoice, ref_id = invoice okey) — proof, not a match. Those links are always written,
 * and a link an earlier run made by order (twins swapped) or by hand is corrected. Everything else —
 * payments, bills, invoices bexio does not reference — is matched on date, amount, accounts and title
 * (see link-bexio-ledger.logic.mjs): safe links are always written; identical twins paired in document
 * order only with --pair-issues / --pair-payments. It writes
 *   - invoices and bills: `bookingKeys` (their bexio bookings, one per document line) and
 *     `payments[i].bookingKey`
 *   - bookings: `counterparty` = receiver / vendor where none is set, plus a note carrying MARKER; a
 *     counterparty this script set is replaced when the journal moves the booking to another invoice,
 *     one set by hand is kept (listed)
 * Booking texts, amounts, status and lines are never touched (GebüV). Ambiguous and unmatched targets
 * are listed for a manual decision. `invoice.bookingKey` stays native-only (`invoice-{key}`), so the
 * invoice Cloud Functions never mistake a linked migrated invoice for a native one, and a re-run of
 * the bexio archive importer keeps the links (mergeArchivedPayments / mergeArchivedBillPayments).
 *
 * LOCKED PERIODS: the Admin SDK bypasses the period lock. Intended — this annotates the migrated
 * history, it posts nothing.
 *
 * Run with:  node scripts/link-bexio-ledger.mjs                     (dry run, tenant scs)
 *            node scripts/link-bexio-ledger.mjs --apply [--pair-issues] [--pair-payments]
 *            node scripts/link-bexio-ledger.mjs --revert [--apply]  (removes every bexio link + marked counterparty)
 *            options: --tenant <accountingTenantId>  --all (list every target of a category, not 5 examples)
 *                     --no-journal (skip the bexio journal: invoices are matched like before)
 *
 * Manual resolution of what stays ambiguous or unmatched:
 *            node scripts/link-bexio-ledger.mjs --report <file.csv> [--year 2026]
 *              writes the unresolved targets (of that year) with their candidate bookings — for an
 *              unmatched target the bookings of the same amount within ±14 days. Fill in the column
 *              "Buchungen" (bexio booking numbers, several for an invoice booked line by line), then
 *            node scripts/link-bexio-ledger.mjs --manual <file.csv> [--apply]
 *              links the filled rows; each is validated (posted bexio row, not linked elsewhere, the
 *              amounts add up) and a refused row is reported, not written. The file holds personal
 *              data: keep it out of the repo.
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *            export BEXIO_APIKEY="$(gcloud secrets versions access latest --secret=BEXIO_APIKEY --project=bkaiser-org)"
 *              (read-only; not needed for --revert or --no-journal)
 *
 * Idempotent: linked targets and referenced bookings are left alone on a re-run.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';

import { createBexioClient } from './bexio-archive/client.mjs';
import { counterpartyPatch, daysBetween, isBexioJournalKey, journalInvoiceRefs, manualLinkProblem, planJournalInvoiceLinks, planLinks, relevantAmount, summarizeBooking } from './link-bexio-ledger.logic.mjs';

const PROJECT_ID = 'bkaiser-org';
const MARKER = '[bexio-ledger-link]';
const RECEIVABLES_ID = '1100';
const PAYABLES_ID = '2000';
const EXAMPLES = 5;
const NEARBY_DAYS = 14;

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const apply = args.includes('--apply');
const revert = args.includes('--revert');
const listAll = args.includes('--all');
const pairIssues = args.includes('--pair-issues');
const pairPayments = args.includes('--pair-payments');
const useJournal = !args.includes('--no-journal');
const tenant = arg('--tenant') ?? 'scs';
const year = arg('--year') ?? '';
const reportPath = arg('--report');
const manualPath = arg('--manual');

const chf = (cents) => (cents / 100).toLocaleString('de-CH', { minimumFractionDigits: 2 });
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const KINDS = ['invoice', 'invoice-payment', 'bill', 'bill-payment'];
const KIND_LABEL = { 'invoice': 'Rechnung', 'invoice-payment': 'Zahlung Rechnung', 'bill': 'Kreditor', 'bill-payment': 'Zahlung Kreditor' };
const viewDate = (d) => (d ? `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}` : '');

const REPORT_COLUMNS = ['Art', 'Dokument', 'Datum', 'Betrag', 'Gegenpartei', 'Problem', 'Kandidaten', 'Buchungen', 'kind', 'docKey', 'index'];
const csvField = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Semicolon CSV (as Excel / Numbers in de-CH read it) with quoted fields; a BOM keeps the umlauts. */
function writeCsv(path, rows) {
  writeFileSync(path, '\ufeff' + rows.map((r) => r.map(csvField).join(';')).join('\r\n') + '\r\n', 'utf8');
}

/** Parses the CSV written above (also after Excel re-saved it: unquoted fields, ';' or ','). */
function readCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^\ufeff/, '');
  const sep = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.some((f) => f.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

async function commitInChunks(db, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, patch] of writes.slice(i, i + 400)) batch.set(ref, patch, { merge: true });
    await batch.commit();
  }
}

/** Finance docs of the accounting tenant (both tenancy fields, as every finance query must). */
async function localDocs(db, collection) {
  const snap = await db.collection(collection)
    .where('tenants', 'array-contains', tenant).where('accountingTenantId', '==', tenant).get();
  return snap.docs.map((d) => ({ ref: d.ref, okey: d.id, ...d.data() }));
}

async function accountKeysById(db, id) {
  const snap = await db.collection('accounts').where('accountingTenantId', '==', tenant).where('id', '==', id).get();
  return snap.docs.map((d) => d.id);
}

function printTargets(title, targets, describe) {
  if (!targets.length) return;
  const bookings = new Set(targets.flatMap((t) => t.bookingKeys ?? t.candidates ?? []));
  console.log(`\n${title}: ${targets.length} target(s), ${bookings.size} booking(s)`);
  for (const t of listAll ? targets : targets.slice(0, EXAMPLES)) console.log(`  ${describe(t)}`);
  if (!listAll && targets.length > EXAMPLES) console.log(`  … ${targets.length - EXAMPLES} more (--all lists them)`);
}

/** Removes every bexio journal link and every counterparty this script set. */
async function planRevert(invoices, bills, bookings) {
  const writes = [];
  for (const doc of [...invoices, ...bills]) {
    const patch = {};
    if ((doc.bookingKeys ?? []).length) patch.bookingKeys = [];
    const payments = doc.payments ?? [];
    if (payments.some((p) => isBexioJournalKey(p.bookingKey))) {
      patch.payments = payments.map((p) => (isBexioJournalKey(p.bookingKey) ? { ...p, bookingKey: '' } : p));
    }
    if (Object.keys(patch).length) writes.push([doc.ref, patch]);
  }
  for (const b of bookings.filter((x) => (x.notes ?? '').includes(MARKER))) {
    const notes = (b.notes ?? '').split('\n').filter((l) => !l.includes(MARKER)).join('\n');
    writes.push([b.ref, { counterparty: FieldValue.delete(), notes }]);
  }
  return writes;
}

async function main() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${revert ? 'revert' : 'link'} · accountingTenantId=${tenant}\n`);

  // 1. Debitoren / Kreditoren: the configured receivables account, else the account numbers
  const config = (await db.collection('accounting-configs').doc(tenant).get()).data() ?? {};
  const receivablesKeys = new Set(config.receivablesAccountKey ? [config.receivablesAccountKey] : await accountKeysById(db, RECEIVABLES_ID));
  const payablesKeys = new Set(await accountKeysById(db, PAYABLES_ID));
  if (!receivablesKeys.size || !payablesKeys.size) { console.error(`no ${RECEIVABLES_ID} / ${PAYABLES_ID} account for ${tenant}`); process.exit(1); }
  console.log(`Debitoren ${[...receivablesKeys].join(',')} · Kreditoren ${[...payablesKeys].join(',')}`);

  // 2. documents and the whole ledger (single-field queries on the lines: no composite index needed)
  const [invoices, bills] = await Promise.all([localDocs(db, 'invoices'), localDocs(db, 'bills')]);
  const bookingDocs = await localDocs(db, 'bookings');
  const lineSnap = await db.collection('booking-lines').where('accountingTenantId', '==', tenant).get();
  const linesByBooking = new Map();
  for (const d of lineSnap.docs) {
    const l = d.data();
    if (!linesByBooking.has(l.bookingKey)) linesByBooking.set(l.bookingKey, []);
    linesByBooking.get(l.bookingKey).push(l);
  }
  console.log(`${invoices.length} invoices · ${bills.length} bills · ${bookingDocs.length} bookings · ${lineSnap.size} lines`);

  let writes;
  if (!revert && useJournal && !process.env.BEXIO_APIKEY) {
    console.error('BEXIO_APIKEY is not set (see the header), or pass --no-journal');
    process.exit(1);
  }
  if (revert) {
    writes = await planRevert(invoices, bills, bookingDocs);
    console.log(`\n${writes.length} document(s) to unlink`);
  } else {
    const summaries = bookingDocs.map((b) => summarizeBooking(b, linesByBooking.get(b.okey)));
    const summaryByKey = new Map(summaries.map((b) => [b.okey, b]));

    // invoices referenced by the bexio journal: linked from the reference, out of the matching below
    let journal = { links: [], problems: [], unreferenced: [], linked: 0 };
    let refs = new Map();
    if (useJournal) {
      const rows = await createBexioClient({ token: process.env.BEXIO_APIKEY }).getAll('/3.0/accounting/journal');
      refs = journalInvoiceRefs(rows);
      journal = planJournalInvoiceLinks({ invoices, refs, summaries: summaryByKey, receivablesKeys });
      console.log(`\nbexio journal: ${rows.length} rows · ${refs.size} invoices referenced`);
      console.log(`journal links: ${journal.links.filter((l) => l.mode === 'new').length} new · ${journal.links.filter((l) => l.mode === 'fix').length} corrected · ${journal.linked} already right · ${journal.problems.length} refused · ${journal.unreferenced.length} migrated invoices without reference`);
    }
    const matchInvoices = invoices.map((inv) => (refs.has(inv.okey) && !inv.bookingKey ? { ...inv, bookingKeys: refs.get(inv.okey) } : inv));
    const { links, ambiguous, unmatched, linked } = planLinks({ invoices: matchInvoices, bills, bookings: summaries, receivablesKeys, payablesKeys });

    const isIssue = (t) => t.index < 0;
    const safe = links.filter((l) => l.mode === 'safe');
    const inOrderIssues = links.filter((l) => l.mode === 'in-order' && isIssue(l));
    const inOrderPayments = links.filter((l) => l.mode === 'in-order' && !isIssue(l));
    const bookingCount = (list) => new Set(list.flatMap((t) => t.bookingKeys ?? t.candidates ?? [])).size;
    console.log('\nkind              safe  in-order  ambiguous  unmatched');
    for (const k of KINDS) {
      const n = (list) => String(list.filter((t) => t.kind === k).length);
      console.log(`${k.padEnd(16)} ${n(safe).padStart(5)} ${n([...inOrderIssues, ...inOrderPayments]).padStart(9)} ${n(ambiguous).padStart(10)} ${n(unmatched).padStart(10)}`);
    }
    console.log(`already linked: ${linked}${useJournal ? ' (invoices referenced by the journal counted here)' : ''}`);
    const docByKey = new Map([...invoices, ...bills].map((d) => [d.okey, d]));
    const amountOf = (t) => {
      const doc = docByKey.get(t.docKey);
      return t.index >= 0 ? doc.payments[t.index].amount : doc.totalAmount?.amount ?? 0;
    };
    const dateOf = (t) => {
      const doc = docByKey.get(t.docKey);
      return t.index >= 0 ? doc.payments[t.index].date : doc.invoiceDate ?? doc.billDate;
    };
    const who = (t) => t.counterparty?.label || [t.counterparty?.name1, t.counterparty?.name2].filter(Boolean).join(' ') || '–';
    const describe = (t) => `${t.kind.padEnd(16)} ${dateOf(t)} ${chf(amountOf(t)).padStart(12)}  ${t.label} · ${who(t)}`
      + (t.bookingKeys ? `  → ${t.bookingKeys.join(', ')}` : t.candidates ? `  → candidates ${t.candidates.join(', ')}` : '');
    printTargets('journal, new (always written)', journal.links.filter((l) => l.mode === 'new'), describe);
    printTargets('journal, corrected (always written)', journal.links.filter((l) => l.mode === 'fix'),
      (t) => `${describe(t)}  (was ${t.previous.join(', ')})`);
    printTargets('journal, refused', journal.problems, (t) => `${t.label} · ${who(t)}: ${t.problem}`);
    printTargets('safe (always written)', safe, describe);
    printTargets(`in order, documents' own bookings (${pairIssues ? 'written: --pair-issues' : 'not written without --pair-issues'})`, inOrderIssues, describe);
    printTargets(`in order, payments (${pairPayments ? 'written: --pair-payments' : 'not written without --pair-payments'})`, inOrderPayments, describe);
    printTargets('ambiguous (decide by hand)', ambiguous, describe);
    printTargets('unmatched (no booking fits)', unmatched, describe);
    console.log(`\nbookings: ${bookingCount(safe)} safe · ${bookingCount(inOrderIssues)} in-order issue · ${bookingCount(inOrderPayments)} in-order payment`);

    // unresolved per year, and the report for a manual decision
    const unresolved = [...ambiguous, ...unmatched];
    const perYear = new Map();
    for (const t of unresolved) perYear.set(dateOf(t).slice(0, 4), (perYear.get(dateOf(t).slice(0, 4)) ?? 0) + 1);
    console.log(`\nunresolved per year: ${[...perYear.entries()].sort().map(([y, n]) => `${y} ${n}`).join(' · ')}`);
    const used = new Set();
    for (const doc of [...invoices, ...bills]) {
      for (const k of [doc.bookingKey, ...(doc.bookingKeys ?? []), ...(doc.payments ?? []).map((p) => p.bookingKey)]) if (k) used.add(k);
    }
    const linkedNow = new Set(links.flatMap((l) => l.bookingKeys));
    const bookingText = (k) => {
      const b = summaryByKey.get(k);
      return b ? `${k} ${viewDate(b.date)} CHF ${chf(relevantAmount('invoice', b, receivablesKeys, payablesKeys) || relevantAmount('invoice-payment', b, receivablesKeys, payablesKeys) || relevantAmount('bill', b, receivablesKeys, payablesKeys) || relevantAmount('bill-payment', b, receivablesKeys, payablesKeys))} «${b.title}»` : k;
    };
    if (reportPath) {
      const rows = unresolved.filter((t) => !year || dateOf(t).startsWith(year))
        .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.label.localeCompare(b.label));
      const lines = rows.map((t) => {
        // an unmatched target: the free bookings of the same amount within ±NEARBY_DAYS
        const nearby = t.candidates ? [] : summaries.filter((b) => b.status === 'posted' && isBexioJournalKey(b.okey) && !used.has(b.okey) && !linkedNow.has(b.okey)
          && b.date && daysBetween(b.date, dateOf(t)) <= NEARBY_DAYS && relevantAmount(t.kind, b, receivablesKeys, payablesKeys) === amountOf(t)).map((b) => b.okey);
        const candidates = t.candidates ?? nearby;
        return [KIND_LABEL[t.kind], t.label, viewDate(dateOf(t)), chf(amountOf(t)), who(t),
          t.candidates ? 'mehrdeutig' : nearby.length ? `keine passende Buchung am Tag; ${nearby.length} gleichen Betrags ±${NEARBY_DAYS} Tage` : 'keine passende Buchung',
          candidates.map(bookingText).join(' | '), '', t.kind, t.docKey, t.index];
      });
      writeCsv(reportPath, [REPORT_COLUMNS, ...lines]);
      console.log(`report: ${lines.length} unresolved target(s)${year ? ` of ${year}` : ''} → ${reportPath}`);
    }

    // manual links from a filled-in report
    const manual = [];
    if (manualPath) {
      const taken = new Set([...used, ...linkedNow]);
      for (const row of readCsv(manualPath)) {
        const bookingKeys = (row['Buchungen'] ?? '').split(/[\s,;+]+/).filter(Boolean);
        if (!bookingKeys.length) continue;
        const doc = docByKey.get(row.docKey);
        const index = Number(row.index);
        if (!doc || !KINDS.includes(row.kind)) { console.log(`  refused ${row['Dokument']}: unknown document`); continue; }
        const t = { kind: row.kind, docKey: row.docKey, index, label: row['Dokument'], counterparty: doc.receiver ?? doc.vendor };
        const problem = manualLinkProblem({ kind: t.kind, amount: amountOf(t), bookingKeys, summaries: summaryByKey, used: taken, receivablesKeys, payablesKeys });
        if (problem) { console.log(`  refused ${t.label} (${KIND_LABEL[t.kind]}): ${problem}`); continue; }
        for (const k of bookingKeys) taken.add(k);
        manual.push({ ...t, mode: 'manual', bookingKeys });
      }
      console.log(`manual: ${manual.length} link(s) accepted from ${manualPath}`);
    }

    // 3. the writes: one patch per document (payments as a whole array), one per booking
    const chosen = manualPath ? manual : [...journal.links, ...safe, ...(pairIssues ? inOrderIssues : []), ...(pairPayments ? inOrderPayments : [])];
    const patches = new Map();
    const patchOf = (ref) => { if (!patches.has(ref.path)) patches.set(ref.path, [ref, {}]); return patches.get(ref.path)[1]; };
    for (const l of chosen) {
      const doc = docByKey.get(l.docKey);
      const patch = patchOf(doc.ref);
      if (isIssue(l)) patch.bookingKeys = l.bookingKeys;
      else {
        patch.payments ??= (doc.payments ?? []).map((p) => ({ ...p }));
        patch.payments[l.index].bookingKey = l.bookingKeys[0];
      }
    }
    const bookingByKey = new Map(bookingDocs.map((b) => [b.okey, b]));
    let counterparties = 0;
    const manualCounterparties = [];
    for (const l of chosen) {
      if (!l.counterparty?.key) continue;
      for (const key of l.bookingKeys) {
        const b = bookingByKey.get(key);
        const note = `Gegenpartei ${today()} aus ${l.kind.startsWith('bill') ? 'Kreditor' : 'Rechnung'} ${l.label} übernommen ${MARKER}`;
        const patch = counterpartyPatch(b, l.counterparty, note);
        if (patch === 'manual') { if (l.mode === 'fix') manualCounterparties.push(`${key} (${l.label}): ${b.counterparty.label ?? b.counterparty.key}`); continue; }
        if (!patch) continue;
        Object.assign(patchOf(b.ref), patch);
        counterparties++;
      }
    }
    // a booking a correction released and no invoice takes over: drop the counterparty this script set
    const relinked = new Set([...chosen.flatMap((l) => l.bookingKeys), ...[...refs.values()].flat()]);
    for (const l of journal.links) {
      for (const key of l.previous.filter((k) => !relinked.has(k))) {
        const b = bookingByKey.get(key);
        if (!b || !(b.notes ?? '').includes(MARKER)) continue;
        Object.assign(patchOf(b.ref), { counterparty: FieldValue.delete(), notes: (b.notes ?? '').split('\n').filter((x) => !x.includes(MARKER)).join('\n') });
      }
    }
    if (manualCounterparties.length) console.log(`\ncounterparty set by hand, kept although the journal names another invoice:\n  ${manualCounterparties.join('\n  ')}`);
    writes = [...patches.values()];
    console.log(`${chosen.length} link(s) chosen · ${counterparties} counterpart${counterparties === 1 ? 'y' : 'ies'} · ${writes.length} document(s) to write`);
  }

  if (!apply) { console.log('nothing written (dry run)'); return; }
  if (!writes.length) return;
  await commitInChunks(db, writes);
  await db.collection('config').doc('bexioMigration').set({
    runs: FieldValue.arrayUnion({
      step: revert ? 'ledger-links-revert' : 'ledger-links',
      finishedAt: new Date().toISOString(),
      counts: { written: writes.length },
    }),
  }, { merge: true });
  console.log('written · run recorded in config/bexioMigration');
}

main().catch((err) => { console.error(err); process.exit(1); });
