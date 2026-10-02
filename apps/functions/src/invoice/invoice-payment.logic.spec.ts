import { describe, expect, it } from 'vitest';
import { appendStornoNote, applyInvoicePayment, cancelBlockers, isPayableState, isUsableIssueBooking, isValidStoreDate, pickBankAccount, InvoiceLike, isValidPaymentId, linkBlockers, linkDecision, openAmount, paymentBlockers, paymentBookingLines, paymentDecision, reversalLines, reminderFeeSum, stornoSourceLines, waiverOutcome, appendNote } from './invoice-payment.logic';

const inv = (o: Partial<InvoiceLike> = {}): InvoiceLike => ({ state: 'pending', totalAmount: { amount: 67550 }, payments: [], accountingTenantId: 'scs', ...o });

describe('invoice payment logic', () => {
  it('open amount = total − payments', () => expect(openAmount(inv({ payments: [{ date: '20261005', amount: 50000, bankAccountKey: 'b', bookingKey: 'x' }] }))).toBe(17550));
  it('refuses overpayment, zero, fractions and non-pending', () => {
    expect(paymentBlockers(inv(), 67551, '20261005')).toContain('overpayment');
    expect(paymentBlockers(inv(), 0, '20261005')).toContain('invalid-amount');
    expect(paymentBlockers(inv(), 10.5, '20261005')).toContain('invalid-amount');
    expect(paymentBlockers(inv({ state: 'paid' }), 100, '20261005')).toContain('not-payable');
    expect(paymentBlockers(inv(), 100, '')).toContain('no-payment-date');
  });
  it('a partial payment stays pending, the completing one sets paid + paymentDate', () => {
    const a = applyInvoicePayment(inv(), { paymentId: 'p1', date: '20261005', amount: 50000, bankAccountKey: 'scs0077', bookingKey: 'invoice-k-pay-0' });
    expect(a.state).toBe('pending'); expect(a.paymentDate).toBeUndefined();
    const b = applyInvoicePayment({ ...inv(), payments: a.payments }, { paymentId: 'p2', date: '20261010', amount: 17550, bankAccountKey: 'scs0077', bookingKey: 'invoice-k-pay-1' });
    expect(b.state).toBe('paid'); expect(b.paymentDate).toBe('20261010'); expect(b.payments).toHaveLength(2);
  });
  it('payment lines debit the bank, credit receivables', () =>
    expect(paymentBookingLines('scs0077', 'scs0093', 17550)).toEqual([
      { accountKey: 'scs0077', debitAmount: { amount: 17550, currency: 'CHF' } },
      { accountKey: 'scs0093', creditAmount: { amount: 17550, currency: 'CHF' } }]));
  it('link refuses foreign, unposted, missing receivables credit and double links', () => {
    const lines = [{ accountKey: 'scs0077' }, { accountKey: 'scs0093', creditAmount: { amount: 67550 } }];
    expect(linkBlockers(undefined, [], 'scs0093', 'scs', 100, [], 'b1')).toContain('booking-not-found');
    expect(linkBlockers({ status: 'forReview', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 100, [], 'b1')).toContain('booking-not-posted');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'gss' }, lines, 'scs0093', 'scs', 100, [], 'b1')).toContain('foreign-booking');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 67551, [], 'b1')).toContain('no-receivables-credit');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 100, ['b1'], 'b1')).toContain('already-linked');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 67550, [], 'b1')).toEqual([]);
  });
  it('a retried payment returns the stored one', () => {
    expect(paymentDecision([{ bookingKey: 'invoice-k-pay-0' }], 'invoice-k-pay-0')).toBe('return-stored');
    expect(paymentDecision([], 'invoice-k-pay-0')).toBe('write');
  });
  it('cancel refuses payments and migrated invoices', () => {
    expect(cancelBlockers({ ...inv(), bookingKey: 'invoice-k', payments: [{ date: 'd', amount: 1, bankAccountKey: 'b', bookingKey: 'x' }] }, 'k', true)).toContain('has-payments');
    expect(cancelBlockers({ ...inv(), bookingKey: '' }, 'k', false)).toContain('no-issue-booking');
    expect(cancelBlockers({ ...inv(), state: 'paid', bookingKey: 'invoice-k' }, 'k', true)).toContain('not-cancellable');
    expect(cancelBlockers({ ...inv(), bookingKey: 'invoice-k' }, 'k', true)).toEqual([]);
  });
  it('reversal swaps debit and credit and keeps other fields', () =>
    expect(reversalLines([{ accountKey: 'a', debitAmount: { amount: 5 }, costCenterKey: 'cc' }])).toEqual([{ accountKey: 'a', creditAmount: { amount: 5 }, costCenterKey: 'cc' }]));
  it('storno source lines append the fee lines; the receivables account nets to zero', () => {
    const issue = [{ accountKey: '1100', debitAmount: { amount: 30000 } }, { accountKey: '3000', creditAmount: { amount: 30000 } }];
    const fee = [{ accountKey: '1100', debitAmount: { amount: 2000 } }, { accountKey: '3400', creditAmount: { amount: 2000 } }];
    const storno = stornoSourceLines(issue, [fee]);
    expect(storno).toEqual([
      { accountKey: '1100', creditAmount: { amount: 30000 } }, { accountKey: '3000', debitAmount: { amount: 30000 } },
      { accountKey: '1100', creditAmount: { amount: 2000 } }, { accountKey: '3400', debitAmount: { amount: 2000 } },
    ]);
    const net = (ls: { accountKey: string; debitAmount?: { amount: number }; creditAmount?: { amount: number } }[]) =>
      ls.filter((l) => l.accountKey === '1100').reduce((n, l) => n + (l.debitAmount?.amount ?? 0) - (l.creditAmount?.amount ?? 0), 0);
    expect(net(issue) + net(fee) + net(storno)).toBe(0);
    expect(stornoSourceLines(issue, [])).toEqual(reversalLines(issue));
  });
  it('refuses negative, NaN and Infinity amounts', () => {
    for (const a of [-5, Number.NaN, Number.POSITIVE_INFINITY]) expect(paymentBlockers(inv(), a, '20261005')).toContain('invalid-amount');
  });
  it('overpayment is measured against the open amount of a partially paid invoice', () => {
    const partial = inv({ payments: [{ date: '20261005', amount: 50000, bankAccountKey: 'b', bookingKey: 'x' }] });
    expect(paymentBlockers(partial, 17551, '20261010')).toContain('overpayment');
    expect(paymentBlockers(partial, 17550, '20261010')).toEqual([]);
  });
  it('cancel refuses an invoice whose booking key is not its own', () =>
    expect(cancelBlockers({ ...inv(), bookingKey: 'other' }, 'k', true)).toContain('no-issue-booking'));
  it('reversal treats null like absent', () =>
    expect(reversalLines([{ accountKey: 'a', debitAmount: { amount: 5 }, creditAmount: null }])).toEqual([{ accountKey: 'a', creditAmount: { amount: 5 } }]));
  it('payment ids are 8-32 alphanumerics', () => {
    expect(isValidPaymentId('abcDEF12')).toBe(true);
    expect(isValidPaymentId('a'.repeat(32))).toBe(true);
    for (const id of ['short', 'a'.repeat(33), 'abc-defg1', 'abc defg1', '', undefined, 12345678]) expect(isValidPaymentId(id)).toBe(false);
  });
  it('a link retry with the same booking, amount and date returns the stored payment', () => {
    const payments = [{ date: '20261005', amount: 100, bookingKey: 'b1' }];
    expect(linkDecision(payments, 'b1', 100, '20261005')).toBe('return-stored');
    expect(linkDecision(payments, 'b1', 101, '20261005')).toBe('write');
    expect(linkDecision(payments, 'b1', 100, '20261006')).toBe('write');
    expect(linkDecision(payments, 'b2', 100, '20261005')).toBe('write');
  });
  it('the bank account of a linked booking prefers a configured payment account, else the first debit line', () => {
    const lines = [{ accountKey: 'r', creditAmount: { amount: 5 } }, { accountKey: 'other', debitAmount: { amount: 1 } }, { accountKey: 'bank', debitAmount: { amount: 5 } }];
    expect(pickBankAccount(lines, ['bank'])).toBe('bank');
    expect(pickBankAccount(lines, ['nope'])).toBe('other');
    expect(pickBankAccount(lines, [])).toBe('other');
    expect(pickBankAccount([{ accountKey: 'r', creditAmount: { amount: 5 } }], ['bank'])).toBe('');
    expect(pickBankAccount([{ accountKey: 'bank', debitAmount: { amount: 0 } }], ['bank'])).toBe('');
  });
  it('isValidStoreDate needs 8 digits and a real calendar date', () => {
    for (const d of ['20261005', '20240229']) expect(isValidStoreDate(d)).toBe(true);
    for (const d of ['20261305', '20260231', '20250229', '2026105', '', '00000415', '20260000', 'abcdefgh', undefined, 20261005]) expect(isValidStoreDate(d)).toBe(false);
  });
  it('applyInvoicePayment coalesces undefined nested fields of existing payments', () => {
    const legacy = inv({ payments: [{ amount: undefined, date: undefined, bankAccountKey: undefined } as never] });
    const a = applyInvoicePayment(legacy, { paymentId: 'p1', date: '20261005', amount: 100, bankAccountKey: 'b', bookingKey: 'k' });
    expect(a.payments[0]).toEqual({ date: '', amount: 0, bankAccountKey: '', bookingKey: '' });
  });
  it('storno note: appended on a new line, reason truncated to the notes limit, never refused', () => {
    expect(appendStornoNote('', '05.10.2026', 'Fehler', 2000)).toBe('[Storniert 05.10.2026] Fehler');
    expect(appendStornoNote('alt', '05.10.2026', 'Fehler', 2000)).toBe('alt\n[Storniert 05.10.2026] Fehler');
    const long = appendStornoNote('x'.repeat(100), '05.10.2026', 'y'.repeat(500), 150);
    expect(long.length).toBe(150);
    expect(long.startsWith('x'.repeat(100) + '\n[Storniert 05.10.2026] y')).toBe(true);
    expect(appendStornoNote('x'.repeat(200), '05.10.2026', 'grund', 150).startsWith('x'.repeat(200))).toBe(true);
  });

  // R10: migrated open items (partial, unpaid) take payments too
  it('payable states are pending, partial and unpaid', () => {
    for (const state of ['pending', 'partial', 'unpaid']) {
      expect(isPayableState(state)).toBe(true);
      expect(paymentBlockers(inv({ state }), 100, '20261005')).toEqual([]);
    }
    for (const state of ['paid', 'cancelled', 'draft', 'issuing', '']) {
      expect(isPayableState(state)).toBe(false);
      expect(paymentBlockers(inv({ state }), 100, '20261005')).toContain('not-payable');
    }
  });
  it('a non-completing payment keeps the current state, the completing one sets paid', () => {
    const a = applyInvoicePayment(inv({ state: 'unpaid' }), { paymentId: 'p1', date: '20261005', amount: 100, bankAccountKey: 'b', bookingKey: 'x' });
    expect(a.state).toBe('unpaid'); expect(a.paymentDate).toBeUndefined();
    const b = applyInvoicePayment(inv({ state: 'partial' }), { paymentId: 'p1', date: '20261005', amount: 100, bankAccountKey: 'b', bookingKey: 'x' });
    expect(b.state).toBe('partial');
    const c = applyInvoicePayment(inv({ state: 'unpaid' }), { paymentId: 'p1', date: '20261007', amount: 67550, bankAccountKey: 'b', bookingKey: 'x' });
    expect(c.state).toBe('paid'); expect(c.paymentDate).toBe('20261007');
  });
  // R12
  it('link refuses invoice bookings and archived bookings, and ignores archived lines', () => {
    const lines = [{ accountKey: 'scs0077' }, { accountKey: 'scs0093', creditAmount: { amount: 67550 } }];
    const posted = { status: 'posted', accountingTenantId: 'scs' };
    expect(linkBlockers(posted, lines, 'scs0093', 'scs', 100, [], 'invoice-k-pay-abc12345')).toContain('invoice-booking');
    expect(linkBlockers({ ...posted, isArchived: true }, lines, 'scs0093', 'scs', 100, [], 'b1')).toContain('booking-archived');
    expect(linkBlockers({ ...posted, isArchived: false }, lines, 'scs0093', 'scs', 100, [], 'b1')).toEqual([]);
    const archivedLine = [{ accountKey: 'scs0093', creditAmount: { amount: 67550 }, isArchived: true }, { accountKey: 'scs0093', creditAmount: { amount: 50 } }];
    expect(linkBlockers(posted, archivedLine, 'scs0093', 'scs', 100, [], 'b1')).toContain('no-receivables-credit');
    expect(linkBlockers(posted, archivedLine, 'scs0093', 'scs', 50, [], 'b1')).toEqual([]);
  });
  it('the issue booking counts only when posted, not archived and in the same books', () => {
    expect(isUsableIssueBooking({ status: 'posted', accountingTenantId: 'scs' }, 'scs')).toBe(true);
    expect(isUsableIssueBooking({ status: 'posted', accountingTenantId: 'scs', isArchived: false }, 'scs')).toBe(true);
    expect(isUsableIssueBooking({ status: 'forReview', accountingTenantId: 'scs' }, 'scs')).toBe(false);
    expect(isUsableIssueBooking({ status: 'posted', accountingTenantId: 'scs', isArchived: true }, 'scs')).toBe(false);
    expect(isUsableIssueBooking({ status: 'posted', accountingTenantId: 'gss' }, 'scs')).toBe(false);
    expect(isUsableIssueBooking(undefined, 'scs')).toBe(false);
  });
  it('cancel refuses a storno date before the invoice date', () => {
    const issued = { ...inv(), bookingKey: 'invoice-k', invoiceDate: '20261002' };
    expect(cancelBlockers(issued, 'k', true, '20261001')).toContain('storno-before-invoice');
    expect(cancelBlockers(issued, 'k', true, '20261002')).toEqual([]);
    expect(cancelBlockers(issued, 'k', true, '20261003')).toEqual([]);
  });
  it('open amount and paid detection include reminder fees', () => {
    const i = { state: 'pending', accountingTenantId: 'a', totalAmount: { amount: 10000 }, payments: [], reminders: [{ level: 1, date: 'd', dueDate: 'd', fee: 2000 }] };
    expect(openAmount(i)).toBe(12000);
    expect(paymentBlockers(i, 12000, '20261101')).toEqual([]);
    expect(applyInvoicePayment(i, { paymentId: 'x', date: '20261101', amount: 12000, bankAccountKey: 'b', bookingKey: 'k' }).state).toBe('paid');
    expect(applyInvoicePayment(i, { paymentId: 'x', date: '20261101', amount: 10000, bankAccountKey: 'b', bookingKey: 'k' }).state).toBe('pending');
  });

  describe('waived reminder fees (D18)', () => {
    const waived = { fee: 2000, waivedAt: '20261101' };
    it('reminderFeeSum skips waived reminders', () => {
      expect(reminderFeeSum([{ fee: 2000 }, waived, { fee: 500, waivedAt: '' }])).toBe(2500);
      expect(reminderFeeSum([waived])).toBe(0);
    });
    it('openAmount and applyInvoicePayment ignore a waived fee', () => {
      const i = inv({ totalAmount: { amount: 10000 }, reminders: [waived] });
      expect(openAmount(i)).toBe(10000);
      const r = applyInvoicePayment(i, { paymentId: 'x', date: '20261105', amount: 10000, bankAccountKey: 'b', bookingKey: 'k' });
      expect(r.state).toBe('paid');
      expect(openAmount({ ...i, payments: r.payments })).toBe(0);
    });
    it('waiverOutcome flips to paid with the latest payment date', () => {
      const pay = (date: string, amount: number) => ({ date, amount, bankAccountKey: 'b', bookingKey: 'k' });
      const base = inv({ totalAmount: { amount: 10000 }, reminders: [waived], payments: [pay('20261105', 4000), pay('20261110', 6000)] });
      expect(waiverOutcome(base)).toEqual({ state: 'paid', paymentDate: '20261110' });
      expect(waiverOutcome({ ...base, payments: [pay('20261110', 6000), pay('20261105', 4000)] })).toEqual({ state: 'paid', paymentDate: '20261110' });
    });
    it('waiverOutcome keeps the state when payments are short, absent, or the state is not payable', () => {
      const pay = { date: '20261105', amount: 9999, bankAccountKey: 'b', bookingKey: 'k' };
      expect(waiverOutcome(inv({ totalAmount: { amount: 10000 }, reminders: [waived], payments: [pay] }))).toEqual({ state: 'pending' });
      expect(waiverOutcome(inv({ totalAmount: { amount: 10000 }, reminders: [waived], payments: [] }))).toEqual({ state: 'pending' });
      expect(waiverOutcome(inv({ state: 'cancelled', totalAmount: { amount: 10 }, payments: [{ ...pay, amount: 10 }] }))).toEqual({ state: 'cancelled' });
    });
    it('waiverOutcome counts the fees that remain', () => {
      const pay = { date: '20261105', amount: 10000, bankAccountKey: 'b', bookingKey: 'k' };
      expect(waiverOutcome(inv({ totalAmount: { amount: 10000 }, reminders: [waived, { fee: 500 }], payments: [pay] }))).toEqual({ state: 'pending' });
    });
    it('appendNote labels the note; appendStornoNote is the Storniert label', () => {
      expect(appendNote('alt', 'Gebühr erlassen', '05.11.2026', 'Kulanz', 100)).toBe('alt\n[Gebühr erlassen 05.11.2026] Kulanz');
      expect(appendNote('', 'Gebühr erlassen', '05.11.2026', 'Kulanz', 100)).toBe('[Gebühr erlassen 05.11.2026] Kulanz');
      expect(appendNote('', 'Gebühr erlassen', '05.11.2026', 'x'.repeat(200), 40)).toHaveLength(40);
      expect(appendStornoNote('', '05.11.2026', 'r', 100)).toBe('[Storniert 05.11.2026] r');
    });
  });
});
