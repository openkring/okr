/**
 * Pure matching logic of scripts/link-bexio-ledger.mjs: which synced bexio journal bookings belong to
 * which migrated invoice, bill or payment. No I/O — see the script for the why and the writes.
 *
 * A bexio journal row carries no reference to its document, so bookings are matched on date, amount,
 * accounts and (for the document's own bookings) title:
 *
 * | target          | date        | bookings                                                         | title   |
 * |-----------------|-------------|------------------------------------------------------------------|---------|
 * | invoice         | invoiceDate | a run of consecutive bookings debiting receivables, summing to the total | = title |
 * | invoice payment | its date    | one booking: debit the payment's bank account, credit receivables = amount | – |
 * | bill            | billDate    | a run of consecutive bookings crediting payables, summing to the total   | = title |
 * | bill payment    | its date    | one booking: debit payables = amount, credit another account     | –       |
 *
 * bexio books a document as one journal row per document line (REA-01000 = 750 + 600), hence runs:
 * consecutive within the bookings of the same date and title, ordered by bexio id.
 *
 * Two modes:
 *  - `safe`: the target has exactly one candidate (run) and no other target claims any of its bookings.
 *  - `in-order`: identical twins — several targets of the same date, title / amount, whose candidates
 *    interleave. bexio created them in sequence, so they are paired in document-number order with the
 *    bookings in bexio-id order. Likely right, but not provable; the script applies them only on request.
 * Everything else is reported, never guessed.
 */
import { isBexioJournalKey } from './bexio-archive/mappers.mjs';

export { isBexioJournalKey };

/** Longest run of bookings one document line can span (guards the run search on big batches). */
const MAX_RUN = 60;

/** A booking header with its lines summed per account: { okey, date, title, status, debit: Map, credit: Map }. */
export function summarizeBooking(booking, lines) {
  const debit = new Map();
  const credit = new Map();
  for (const l of lines ?? []) {
    if (l.isArchived === true) continue;
    const d = l.debitAmount?.amount ?? 0;
    const c = l.creditAmount?.amount ?? 0;
    if (d) debit.set(l.accountKey, (debit.get(l.accountKey) ?? 0) + d);
    if (c) credit.set(l.accountKey, (credit.get(l.accountKey) ?? 0) + c);
  }
  return { okey: booking.okey, date: booking.date ?? '', title: booking.title ?? '', status: booking.status ?? '', debit, credit };
}

/** Title for comparing: bexio prefixes some rows with a tag, e.g. "(Lieferantenrechnung erstellt) Heizung". */
const normTitle = (t) => (t ?? '').trim().replace(/^\([^)]*\)\s*/, '').replace(/\s+/g, ' ');
const sumOver = (map, keys) => [...keys].reduce((s, k) => s + (map.get(k) ?? 0), 0);
const byBexioId = (a, b) => Number(a.okey) - Number(b.okey);
/** Document number for in-order pairing: invoiceNo, else the digits of invoiceId / billId, else the okey. */
const docNo = (doc) => Number(doc.invoiceNo) || Number(String(doc.invoiceId ?? doc.billId ?? '').replace(/\D/g, '')) || Number(doc.okey) || 0;

/** All contiguous slices of `list` (by index) whose `amount` sums to `total`. */
function runsOf(list, total) {
  const runs = [];
  for (let i = 0; i < list.length; i++) {
    let sum = 0;
    for (let j = i; j < list.length && j - i < MAX_RUN; j++) {
      sum += list[j].amount;
      if (sum === total) { runs.push([i, j]); break; }
      if (sum > total) break;
    }
  }
  return runs;
}

/**
 * Plans the links. Targets that already carry a link are left alone (counted as `linked`).
 * @param {object} input
 * @param {object[]} input.invoices  invoice docs with `okey`
 * @param {object[]} input.bills     bill docs with `okey`
 * @param {object[]} input.bookings  summaries from {@link summarizeBooking}
 * @param {Set<string>} input.receivablesKeys  Debitoren account okey(s)
 * @param {Set<string>} input.payablesKeys     Kreditoren account okey(s)
 * @returns {{ links: object[], ambiguous: object[], unmatched: object[], linked: number }}
 *   link = { kind, mode: 'safe' | 'in-order', docKey, index (payments only, else -1), label, counterparty, bookingKeys }
 */
export function planLinks({ invoices, bills, bookings, receivablesKeys, payablesKeys }) {
  // every booking already referenced by a document stays out of the candidates
  const used = new Set();
  for (const doc of [...invoices, ...bills]) {
    for (const k of [doc.bookingKey, ...(doc.bookingKeys ?? []), ...(doc.payments ?? []).map((p) => p.bookingKey)]) {
      if (typeof k === 'string' && k !== '') used.add(k);
    }
  }
  const pool = bookings.filter((b) => b.status === 'posted' && isBexioJournalKey(b.okey) && !used.has(b.okey)).sort(byBexioId);

  const links = [];
  const ambiguous = [];
  const unmatched = [];
  let linked = 0;
  const target = (kind, doc, index, extra) => ({
    kind, docKey: doc.okey, index, no: docNo(doc), counterparty: doc.receiver ?? doc.vendor,
    label: `${doc.invoiceId || doc.billId || doc.okey} ${doc.title ?? ''}`.trim(), ...extra,
  });
  const strip = ({ no, ...t }) => t;

  // ---- the documents' own bookings: runs within the same date + title
  const issueTargets = [];
  for (const inv of invoices) {
    if (inv.bookingKey || (inv.bookingKeys ?? []).length) { linked++; continue; }
    const total = inv.totalAmount?.amount ?? 0;
    if (total > 0) issueTargets.push(target('invoice', inv, -1, { date: inv.invoiceDate ?? '', title: normTitle(inv.title), total }));
  }
  for (const bill of bills) {
    if ((bill.bookingKeys ?? []).length) { linked++; continue; }
    const total = bill.totalAmount?.amount ?? 0;
    if (total > 0) issueTargets.push(target('bill', bill, -1, { date: bill.billDate ?? '', title: normTitle(bill.title), total }));
  }
  const issueGroups = new Map();     // kind|date|title -> { list: [{okey, amount}], targets: [] }
  const groupOf = (kind, date, title) => {
    const key = `${kind}|${date}|${title}`;
    if (!issueGroups.has(key)) issueGroups.set(key, { list: [], targets: [] });
    return issueGroups.get(key);
  };
  for (const b of pool) {
    const r = sumOver(b.debit, receivablesKeys);
    if (r > 0) groupOf('invoice', b.date, normTitle(b.title)).list.push({ okey: b.okey, amount: r });
    const p = sumOver(b.credit, payablesKeys);
    if (p > 0) groupOf('bill', b.date, normTitle(b.title)).list.push({ okey: b.okey, amount: p });
  }
  for (const t of issueTargets) {
    const g = issueGroups.get(`${t.kind}|${t.date}|${t.title}`);
    if (g) g.targets.push(t);
    else unmatched.push(strip(t));
  }
  for (const g of issueGroups.values()) {
    if (!g.targets.length) continue;
    const runs = new Map(g.targets.map((t) => [t, runsOf(g.list, t.total)]));
    const claims = new Array(g.list.length).fill(0);
    for (const rs of runs.values()) {
      const seen = new Set();
      for (const [i, j] of rs) for (let k = i; k <= j; k++) seen.add(k);
      for (const k of seen) claims[k]++;
    }
    const taken = new Set();
    const rest = [];
    for (const t of g.targets) {
      const rs = runs.get(t);
      if (rs.length === 0) { unmatched.push(strip(t)); continue; }
      const [i, j] = rs[0];
      if (rs.length === 1 && claims.slice(i, j + 1).every((c) => c === 1)) {
        for (let k = i; k <= j; k++) taken.add(k);
        links.push({ ...strip(t), mode: 'safe', bookingKeys: g.list.slice(i, j + 1).map((b) => b.okey) });
      } else rest.push(t);
    }
    // in order: the remaining twins against the remaining bookings, both in sequence; any misfit drops the group
    const free = g.list.filter((_, k) => !taken.has(k));
    const sorted = [...rest].sort((a, b) => a.no - b.no);
    const paired = [];
    let p = 0;
    for (const t of sorted) {
      let sum = 0;
      let j = p;
      while (j < free.length && sum < t.total) sum += free[j++].amount;
      if (sum !== t.total) break;
      paired.push({ ...strip(t), mode: 'in-order', bookingKeys: free.slice(p, j).map((b) => b.okey) });
      p = j;
    }
    if (paired.length === sorted.length) links.push(...paired);
    else for (const t of rest) ambiguous.push({ ...strip(t), candidates: [...new Set(runs.get(t).flatMap(([i, j]) => g.list.slice(i, j + 1).map((b) => b.okey)))] });
  }

  // ---- payments: one booking each
  const paymentTargets = [];
  const consider = (kind, doc, fits) => (doc.payments ?? []).forEach((pay, i) => {
    if (pay.bookingKey) { linked++; return; }
    if (!(pay.amount > 0)) return;
    const candidates = pool.filter((b) => b.date === pay.date && fits(b, pay)).map((b) => b.okey);
    paymentTargets.push(target(kind, doc, i, { date: pay.date, amount: pay.amount, bank: pay.bankAccountKey ?? '', candidates }));
  });
  for (const inv of invoices) consider('invoice-payment', inv, (b, pay) =>
    sumOver(b.credit, receivablesKeys) === pay.amount && (pay.bankAccountKey ? b.debit.get(pay.bankAccountKey) === pay.amount : b.debit.size > 0));
  for (const bill of bills) consider('bill-payment', bill, (b, pay) =>
    sumOver(b.debit, payablesKeys) === pay.amount && [...b.credit.keys()].some((k) => !payablesKeys.has(k)));

  const claims = new Map();
  for (const t of paymentTargets) for (const k of t.candidates) claims.set(k, (claims.get(k) ?? 0) + 1);
  const rest = [];
  for (const t of paymentTargets) {
    const { candidates, ...r } = t;
    if (candidates.length === 0) unmatched.push(strip(r));
    else if (candidates.length === 1 && claims.get(candidates[0]) === 1) links.push({ ...strip(r), mode: 'safe', bookingKeys: candidates });
    else rest.push(t);
  }
  // in order: a group of payments sharing exactly the same candidates, as many as there are candidates
  const twins = new Map();
  for (const t of rest) {
    const key = `${t.kind}|${t.candidates.join(',')}`;
    if (!twins.has(key)) twins.set(key, []);
    twins.get(key).push(t);
  }
  for (const group of twins.values()) {
    const candidates = group[0].candidates;
    const exclusive = candidates.every((k) => claims.get(k) === group.length);
    if (exclusive && group.length === candidates.length) {
      [...group].sort((a, b) => a.no - b.no).forEach((t, n) => {
        const { candidates: _c, ...r } = t;
        links.push({ ...strip(r), mode: 'in-order', bookingKeys: [candidates[n]] });
      });
    } else for (const t of group) ambiguous.push(strip(t));
  }

  return { links, ambiguous, unmatched, linked };
}

/**
 * The amount a booking contributes to a target of `kind`: what it debits on receivables (invoice),
 * credits on receivables (invoice payment), credits on payables (bill) or debits on payables (bill payment).
 */
export function relevantAmount(kind, summary, receivablesKeys, payablesKeys) {
  switch (kind) {
    case 'invoice': return sumOver(summary.debit, receivablesKeys);
    case 'invoice-payment': return sumOver(summary.credit, receivablesKeys);
    case 'bill': return sumOver(summary.credit, payablesKeys);
    case 'bill-payment': return sumOver(summary.debit, payablesKeys);
  }
  return 0;
}

/** Days between two StoreDates (yyyyMMdd), absolute. */
export function daysBetween(a, b) {
  const t = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
  return Math.abs(t(a) - t(b)) / 86_400_000;
}

/**
 * Why a manual link of `bookingKeys` to a target of `kind` and `amount` is refused, or '' when it is fine:
 * every booking must exist, be a posted bexio row not linked elsewhere, and together carry the amount.
 * @param {Map<string, object>} summaries  booking okey -> summary
 * @param {Set<string>} used               booking keys already linked to a document
 */
export function manualLinkProblem({ kind, amount, bookingKeys, summaries, used, receivablesKeys, payablesKeys }) {
  if (!bookingKeys.length) return 'no booking';
  if (kind.endsWith('-payment') && bookingKeys.length > 1) return 'a payment takes one booking';
  let sum = 0;
  for (const k of bookingKeys) {
    const b = summaries.get(k);
    if (!b) return `booking ${k} not found`;
    if (!isBexioJournalKey(k)) return `booking ${k} is not a bexio row`;
    if (b.status !== 'posted') return `booking ${k} is ${b.status}`;
    if (used.has(k)) return `booking ${k} is already linked`;
    sum += relevantAmount(kind, b, receivablesKeys, payablesKeys);
  }
  return sum === amount ? '' : `the bookings carry ${sum}, the ${kind} ${amount}`;
}

// ---- the documents' own bookings from the bexio journal reference

const MARKER = '[bexio-ledger-link]';

/**
 * bexio's journal (GET /3.0/accounting/journal) names the document of each row: `ref_class`
 * `KbInvoice` + `ref_id` = the bexio invoice id, which is the okey of the migrated invoice. Payments
 * carry `KbClientAccountEntry` (a payment entry, not the invoice) and stay with {@link planLinks}.
 * @param {object[]} journal  raw bexio journal rows
 * @returns {Map<string, string[]>} invoice okey -> booking okeys (bexio row ids) in bexio id order
 */
export function journalInvoiceRefs(journal) {
  const refs = new Map();
  for (const row of [...journal].sort((a, b) => a.id - b.id)) {
    if (row.ref_class !== 'KbInvoice' || row.ref_id == null) continue;
    const key = String(row.ref_id);
    if (!refs.has(key)) refs.set(key, []);
    refs.get(key).push(String(row.id));
  }
  return refs;
}

/**
 * Plans the links of migrated invoices to their own (issue) bookings from the journal reference.
 * Unlike {@link planLinks} this is proof, not a match: it also corrects links an earlier run made
 * by order or by hand. A link is refused when a referenced booking is missing in okr or the bookings'
 * net on receivables (debits minus reversing credits) is not the invoice total.
 * @param {object} input
 * @param {object[]} input.invoices        invoice docs with `okey`
 * @param {Map<string, string[]>} input.refs  from {@link journalInvoiceRefs}
 * @param {Map<string, object>} input.summaries  booking okey -> summary ({@link summarizeBooking})
 * @param {Set<string>} input.receivablesKeys
 * @returns {{ links: object[], problems: object[], unreferenced: string[], linked: number }}
 *   link = { kind: 'invoice', mode: 'new' | 'fix', docKey, index: -1, label, counterparty, bookingKeys, previous }
 */
export function planJournalInvoiceLinks({ invoices, refs, summaries, receivablesKeys }) {
  const links = [];
  const problems = [];
  const unreferenced = [];
  let linked = 0;
  for (const inv of [...invoices].sort((a, b) => Number(a.okey) - Number(b.okey))) {
    if (inv.bookingKey) continue;                       // native invoice: linked by construction
    const bookingKeys = refs.get(inv.okey);
    if (!bookingKeys?.length) { unreferenced.push(inv.okey); continue; }
    const previous = inv.bookingKeys ?? [];
    const label = `${inv.invoiceId || inv.okey} ${inv.title ?? ''}`.trim();
    const base = { kind: 'invoice', docKey: inv.okey, index: -1, label, counterparty: inv.receiver };
    const missing = bookingKeys.find((k) => !summaries.has(k));
    if (missing) { problems.push({ ...base, problem: `booking ${missing} not found` }); continue; }
    const net = bookingKeys.reduce((s, k) => s + sumOver(summaries.get(k).debit, receivablesKeys) - sumOver(summaries.get(k).credit, receivablesKeys), 0);
    const total = inv.totalAmount?.amount ?? 0;
    if (net !== total) { problems.push({ ...base, problem: `the bookings carry ${net}, the invoice ${total}` }); continue; }
    if ([...previous].sort().join() === [...bookingKeys].sort().join()) { linked++; continue; }
    links.push({ ...base, mode: previous.length ? 'fix' : 'new', bookingKeys, previous });
  }
  return { links, problems, unreferenced, linked };
}

/**
 * The booking patch that gives it `counterparty`: null when it already has it, 'manual' when another
 * one was set by hand (left alone), else counterparty + notes. A counterparty this script set (its
 * note carries the marker) is replaced together with its note.
 */
export function counterpartyPatch(booking, counterparty, note) {
  const current = booking.counterparty;
  if (current?.key === counterparty.key) return null;
  const lines = (booking.notes ?? '').split('\n').filter((l) => l !== '');
  if (current?.key && !lines.some((l) => l.includes(MARKER))) return 'manual';
  const kept = lines.filter((l) => !l.includes(MARKER));
  return { counterparty, notes: [...kept, note].join('\n') };
}
