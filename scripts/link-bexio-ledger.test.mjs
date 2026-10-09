import { test } from 'node:test';
import assert from 'node:assert/strict';

import { counterpartyPatch, daysBetween, isBexioJournalKey, journalInvoiceRefs, manualLinkProblem, planJournalInvoiceLinks, planLinks, summarizeBooking } from './link-bexio-ledger.logic.mjs';

const R = 'scs0093';   // 1100 Debitoren
const P = 'scs0121';   // 2000 Kreditoren
const BANK = 'scs0077';
const money = (amount) => ({ amount, currency: 'CHF', periodicity: 'one-time' });
const line = (accountKey, debit, credit) => ({ accountKey, debitAmount: debit ? money(debit) : null, creditAmount: credit ? money(credit) : null });
const booking = (okey, date, title, lines, status = 'posted') => summarizeBooking({ okey, date, title, status }, lines);
const plan = (invoices, bills, bookings) => planLinks({ invoices, bills, bookings, receivablesKeys: new Set([R]), payablesKeys: new Set([P]) });

const person = (key, label) => ({ key, label, modelType: 'person', name1: '', name2: '', type: '', subType: '' });
const invoice = (okey, patch) => ({ okey, invoiceId: `REA-${okey}`, title: 'Ruderkurs', invoiceDate: '20260914', totalAmount: money(30000), bookingKey: undefined, payments: [], receiver: person(`p${okey}`, `Person ${okey}`), ...patch });

test('bexio journal ids are numeric, okr keys are not', () => {
  assert.equal(isBexioJournalKey('12052'), true);
  assert.equal(isBexioJournalKey('invoice-2094'), false);
  assert.equal(isBexioJournalKey(''), false);
});

test('summarizeBooking sums lines per account and side, skipping archived lines', () => {
  const s = summarizeBooking({ okey: '1', date: '20260101', title: 't', status: 'posted' },
    [line(R, 100, 0), line(R, 50, 0), line('x', 0, 150), { ...line('y', 9, 0), isArchived: true }]);
  assert.equal(s.debit.get(R), 150);
  assert.equal(s.credit.get('x'), 150);
  assert.equal(s.debit.has('y'), false);
});

test('links an invoice to its issue and payment bookings', () => {
  const inv = invoice('2094', { payments: [{ date: '20260917', amount: 30000, bankAccountKey: BANK }] });
  const bookings = [
    booking('12052', '20260914', 'Ruderkurs', [line(R, 30000, 0), line('scs0289', 0, 30000)]),
    booking('12054', '20260917', 'Zahlungseingang', [line(BANK, 30000, 0), line(R, 0, 30000)]),
    booking('12063', '20260914', '(Zahlungsausgang) x', [line(P, 30000, 0), line(BANK, 0, 30000)]),
  ];
  const r = plan([inv], [], bookings);
  assert.deepEqual(r.links.map(l => [l.kind, l.mode, l.docKey, l.index, l.bookingKeys]), [
    ['invoice', 'safe', '2094', -1, ['12052']],
    ['invoice-payment', 'safe', '2094', 0, ['12054']],
  ]);
  assert.equal(r.links[0].counterparty.label, 'Person 2094');
  assert.deepEqual([r.ambiguous.length, r.unmatched.length], [0, 0]);
});

test('an invoice booked as one bexio row per line links all of its rows', () => {
  const inv = invoice('1000', { title: 'Jahresbeitrag 2023', totalAmount: money(135000) });
  const bookings = [
    booking('6278', '20260914', 'Jahresbeitrag 2023', [line(R, 75000, 0), line('scs0158', 0, 75000)]),
    booking('6279', '20260914', 'Jahresbeitrag 2023', [line(R, 60000, 0), line('scs0159', 0, 60000)]),
  ];
  const r = plan([inv], [], bookings);
  assert.deepEqual(r.links.map(l => [l.mode, l.bookingKeys]), [['safe', ['6278', '6279']]]);
});

test('identical invoices of the same day pair in order of invoice and bexio number', () => {
  const a = invoice('1', { invoiceId: 'REA-01032', title: 'Jahresbeitrag', totalAmount: money(10000) });
  const b = invoice('2', { invoiceId: 'REA-01031', title: 'Jahresbeitrag', totalAmount: money(10000) });
  const bookings = [
    booking('21', '20260914', 'Jahresbeitrag', [line(R, 10000, 0), line('rev', 0, 10000)]),
    booking('20', '20260914', 'Jahresbeitrag', [line(R, 10000, 0), line('rev', 0, 10000)]),
  ];
  const r = plan([a, b], [], bookings);
  assert.deepEqual(r.links.map(l => [l.mode, l.label, l.bookingKeys]), [
    ['in-order', 'REA-01031 Jahresbeitrag', ['20']],
    ['in-order', 'REA-01032 Jahresbeitrag', ['21']],
  ]);
});

test('twins that do not add up in sequence stay ambiguous', () => {
  const a = invoice('1', { title: 'Lizenz', totalAmount: money(10000) });
  const b = invoice('2', { title: 'Lizenz', totalAmount: money(10000) });
  const bookings = [
    booking('20', '20260914', 'Lizenz', [line(R, 10000, 0), line('rev', 0, 10000)]),
    booking('21', '20260914', 'Lizenz', [line(R, 4000, 0), line('rev', 0, 4000)]),    // a third, unrelated row in between
    booking('22', '20260914', 'Lizenz', [line(R, 10000, 0), line('rev', 0, 10000)]),
  ];
  const r = plan([a, b], [], bookings);
  assert.equal(r.links.length, 0);
  assert.deepEqual(r.ambiguous.map(t => t.candidates), [['20', '22'], ['20', '22']]);
});

test('same-day payments of the same amount pair in order only when they share exactly their candidates', () => {
  const pay = { date: '20260917', amount: 30000, bankAccountKey: BANK };
  const a = invoice('1', { invoiceId: 'REA-2', title: 'A', payments: [pay] });
  const b = invoice('2', { invoiceId: 'REA-1', title: 'B', payments: [pay] });
  const bookings = [
    booking('54', '20260917', 'Zahlungseingang', [line(BANK, 30000, 0), line(R, 0, 30000)]),
    booking('55', '20260917', 'Zahlungseingang', [line(BANK, 30000, 0), line(R, 0, 30000)]),
  ];
  const r = plan([a, b], [], bookings);
  assert.deepEqual(r.links.filter(l => l.kind === 'invoice-payment').map(l => [l.mode, l.label, l.bookingKeys]), [
    ['in-order', 'REA-1 B', ['54']],
    ['in-order', 'REA-2 A', ['55']],
  ]);
});

test('a payment booking claimed by two payments links neither', () => {
  const a = invoice('1', { payments: [{ date: '20260917', amount: 30000, bankAccountKey: BANK }] });
  const b = invoice('2', { title: 'Other', payments: [{ date: '20260917', amount: 30000, bankAccountKey: BANK }] });
  const r = plan([a, b], [], [booking('54', '20260917', 'Zahlungseingang', [line(BANK, 30000, 0), line(R, 0, 30000)])]);
  assert.equal(r.links.length, 0);
  assert.equal(r.ambiguous.length, 2);
  assert.equal(r.unmatched.length, 2);    // the two issue bookings do not exist
});

test('the title, date, amount, account and status must all fit', () => {
  const inv = invoice('1', { payments: [{ date: '20260917', amount: 30000, bankAccountKey: BANK }] });
  const bookings = [
    booking('1', '20260914', 'Ruderkurs Herbst', [line(R, 30000, 0), line('rev', 0, 30000)]),          // other title
    booking('2', '20260915', 'Ruderkurs', [line(R, 30000, 0), line('rev', 0, 30000)]),                 // other date
    booking('3', '20260914', 'Ruderkurs', [line(R, 29900, 0), line('rev', 0, 29900)]),                 // other amount
    booking('4', '20260917', 'Zahlungseingang', [line('scs0078', 30000, 0), line(R, 0, 30000)]),      // other bank
    booking('5', '20260914', 'Ruderkurs', [line(R, 30000, 0), line('rev', 0, 30000)], 'cancelled'),   // not posted
    booking('invoice-9', '20260914', 'Ruderkurs', [line(R, 30000, 0), line('rev', 0, 30000)]),        // an okr booking
  ];
  const r = plan([inv], [], bookings);
  assert.equal(r.links.length, 0);
  assert.equal(r.unmatched.length, 2);
});

test('already linked targets and used bookings are left alone (idempotent re-run)', () => {
  const inv = invoice('1', { bookingKeys: ['12052'], payments: [{ date: '20260917', amount: 30000, bankAccountKey: BANK, bookingKey: '12054' }] });
  const other = invoice('2');
  const r = plan([inv, other], [], [booking('12052', '20260914', 'Ruderkurs', [line(R, 30000, 0), line('rev', 0, 30000)])]);
  assert.equal(r.linked, 2);
  assert.equal(r.links.length, 0);       // 12052 is used by invoice 1, so invoice 2 does not get it
  assert.equal(r.unmatched.length, 1);
});

test('links a bill to its booking and each payment of a batch order to its own booking', () => {
  const vendor = { key: 'o1', label: 'SRV SwissRowing', modelType: 'org', name1: '', name2: '', type: '', subType: '' };
  const bill = (okey, title, amount) => ({ okey, billId: '', title, billDate: '20260913', totalAmount: money(amount), vendor, payments: [{ date: '20260914', amount, type: 'RECONCILED' }] });
  const bills = [bill('a', 'Cup Luzern', 71260), bill('b', 'Cup Sevilla', 129400)];
  const bookings = [
    booking('12047', '20260913', 'Cup Luzern', [line('scs0314', 71260, 0), line(P, 0, 71260)]),
    booking('12048', '20260913', 'Cup Sevilla', [line('scs0314', 129400, 0), line(P, 0, 129400)]),
    booking('12063', '20260914', '(Zahlungsausgang) Belastungen Mobile Banking (3)', [line(P, 71260, 0), line(BANK, 0, 71260)]),
    booking('12064', '20260914', '(Zahlungsausgang) Belastungen Mobile Banking (3)', [line(P, 129400, 0), line(BANK, 0, 129400)]),
  ];
  const r = plan([], bills, bookings);
  assert.deepEqual(r.links.map(l => `${l.kind}:${l.docKey}:${l.bookingKeys}`), [
    'bill:a:12047', 'bill:b:12048', 'bill-payment:a:12063', 'bill-payment:b:12064',
  ]);
  assert.equal(r.links[2].counterparty.label, 'SRV SwissRowing');
});

test('a bexio tag in front of the booking title is ignored', () => {
  const vendor = { key: 'o1', label: 'Energie 360', modelType: 'org', name1: '', name2: '', type: '', subType: '' };
  const bill = { okey: 'x', billId: '00803', title: 'Heizung+Warmwasser', billDate: '20250724', totalAmount: money(33820), vendor, payments: [] };
  const r = plan([], [bill], [booking('10265', '20250724', '(Lieferantenrechnung erstellt) Heizung+Warmwasser', [line('scs0233', 33820, 0), line(P, 0, 33820)])]);
  assert.deepEqual(r.links.map(l => l.bookingKeys), [['10265']]);
});

test('manual links are validated: existence, bexio row, posted, unused, amount', () => {
  const summaries = new Map([
    ['6278', booking('6278', '20260914', 'x', [line(R, 75000, 0), line('rev', 0, 75000)])],
    ['6279', booking('6279', '20260914', 'x', [line(R, 60000, 0), line('rev', 0, 60000)])],
    ['6280', booking('6280', '20260914', 'x', [line(R, 100, 0), line('rev', 0, 100)], 'cancelled')],
    ['54', booking('54', '20260917', 'Zahlungseingang', [line(BANK, 30000, 0), line(R, 0, 30000)])],
  ]);
  const check = (kind, amount, bookingKeys, used = new Set()) =>
    manualLinkProblem({ kind, amount, bookingKeys, summaries, used, receivablesKeys: new Set([R]), payablesKeys: new Set([P]) });
  assert.equal(check('invoice', 135000, ['6278', '6279']), '');
  assert.equal(check('invoice-payment', 30000, ['54']), '');
  assert.match(check('invoice', 135000, ['6278']), /carry 75000/);
  assert.match(check('invoice', 100, ['6280']), /cancelled/);
  assert.match(check('invoice', 1, ['9999']), /not found/);
  assert.match(check('invoice-payment', 30000, ['54'], new Set(['54'])), /already linked/);
  assert.match(check('invoice-payment', 30000, ['54', '6278']), /one booking/);
  assert.equal(check('invoice', 1, []), 'no booking');
});

test('daysBetween counts calendar days across months', () => {
  assert.equal(daysBetween('20260228', '20260301'), 1);
  assert.equal(daysBetween('20260914', '20260914'), 0);
});

// ---- links from the bexio journal reference (ref_class KbInvoice, ref_id = bexio invoice id = invoice okey)

const journalRow = (id, refId, debit, credit, amount, refClass = 'KbInvoice') => ({ id, ref_id: refId, ref_class: refClass, debit_account_id: debit, credit_account_id: credit, amount });
const planJournal = (invoices, refs, bookings) =>
  planJournalInvoiceLinks({ invoices, refs, summaries: new Map(bookings.map((b) => [b.okey, b])), receivablesKeys: new Set([R]) });

test('journalInvoiceRefs groups the KbInvoice rows by invoice id, in bexio id order', () => {
  const refs = journalInvoiceRefs([journalRow(11, 7, 93, 159, 75), journalRow(10, 7, 93, 284, 600), journalRow(12, 8, 93, 159, 75),
    journalRow(13, 7, 77, 93, 675, 'KbClientAccountEntry'), { ...journalRow(14, null, 93, 159, 1) }]);
  assert.deepEqual([...refs.entries()], [['7', ['10', '11']], ['8', ['12']]]);
});

test('identical twins link by the journal reference, not by their order', () => {
  // bexio booked 1778 before 1770: the order says nothing
  const bookings = [booking('10868', '20260416', 'Jahresbeitrag 2026', [line(R, 7500, 0), line('scs0159', 0, 7500)]),
    booking('10869', '20260416', 'Jahresbeitrag 2026', [line(R, 7500, 0), line('scs0159', 0, 7500)])];
  const twins = [invoice('1770', { totalAmount: money(7500) }), invoice('1778', { totalAmount: money(7500) })];
  const { links, problems, linked } = planJournal(twins, new Map([['1778', ['10868']], ['1770', ['10869']]]), bookings);
  assert.deepEqual(links.map((l) => [l.docKey, l.bookingKeys, l.mode]), [['1770', ['10869'], 'new'], ['1778', ['10868'], 'new']]);
  assert.equal(problems.length, 0);
  assert.equal(linked, 0);
});

test('a wrong link is corrected, a correct one left alone', () => {
  const bookings = [booking('6410', '20230416', 'Ruderkurs', [line(R, 30000, 0), line('x', 0, 30000)]),
    booking('6411', '20230416', 'Ruderkurs', [line(R, 30000, 0), line('x', 0, 30000)]),
    booking('6412', '20230416', 'Ruderkurs', [line(R, 30000, 0), line('x', 0, 30000)])];
  const invoices = [invoice('1002', { bookingKeys: ['6410'] }), invoice('1003', { bookingKeys: ['6411'] }), invoice('1004', { bookingKeys: ['6412'] })];
  const { links, linked } = planJournal(invoices, new Map([['1002', ['6411']], ['1003', ['6410']], ['1004', ['6412']]]), bookings);
  assert.deepEqual(links.map((l) => [l.docKey, l.bookingKeys, l.previous, l.mode]), [['1002', ['6411'], ['6410'], 'fix'], ['1003', ['6410'], ['6411'], 'fix']]);
  assert.equal(linked, 1);
});

test('a journal link is refused when a booking is missing in okr or the amounts do not add up', () => {
  const bookings = [booking('1', '20260101', 'Ruderkurs', [line(R, 20000, 0), line('x', 0, 20000)])];
  const { links, problems } = planJournal([invoice('5'), invoice('6')], new Map([['5', ['1']], ['6', ['2']]]), bookings);
  assert.equal(links.length, 0);
  assert.deepEqual(problems.map((p) => [p.docKey, p.problem]), [['5', 'the bookings carry 20000, the invoice 30000'], ['6', 'booking 2 not found']]);
});

test('a reversing row (credit on receivables) counts against the total', () => {
  const bookings = [booking('1', '20260101', 'Ruderkurs', [line(R, 40000, 0), line('x', 0, 40000)]),
    booking('2', '20260101', 'Ruderkurs', [line('x', 10000, 0), line(R, 0, 10000)])];
  const { links } = planJournal([invoice('5')], new Map([['5', ['1', '2']]]), bookings);
  assert.deepEqual(links.map((l) => l.bookingKeys), [['1', '2']]);
});

test('native invoices and invoices without a journal reference are not touched', () => {
  const { links, problems, unreferenced } = planJournal([invoice('5', { bookingKey: 'invoice-5' }), invoice('6')], new Map(), []);
  assert.equal(links.length + problems.length, 0);
  assert.deepEqual(unreferenced, ['6']);
});

test('counterpartyPatch sets a missing counterparty, corrects one this script set, keeps one set by hand', () => {
  const a = person('pa', 'Anna');
  const b = person('pb', 'Beat');
  const note = 'Gegenpartei 05.10.2026 aus Rechnung REA-1 Ruderkurs übernommen [bexio-ledger-link]';
  const make = (counterparty, notes) => ({ counterparty, notes });
  assert.deepEqual(counterpartyPatch(make(undefined, ''), a, 'NEW [bexio-ledger-link]'), { counterparty: a, notes: 'NEW [bexio-ledger-link]' });
  assert.equal(counterpartyPatch(make(a, note), a, 'NEW'), null);
  assert.deepEqual(counterpartyPatch(make(b, `Kommentar\n${note}`), a, 'NEW [bexio-ledger-link]'), { counterparty: a, notes: 'Kommentar\nNEW [bexio-ledger-link]' });
  assert.equal(counterpartyPatch(make(b, 'von Hand'), a, 'NEW'), 'manual');
});
