import { describe, expect, it } from 'vitest';

import { billBookingTitle, planBillDetailsUpdate } from './bill-details.logic';

const line = (o: Record<string, unknown> = {}) => ({ title: 'Internet', accountKey: 'a1', amount: 3900, vatCodeKey: '', costCenterKey: '', projectKey: '', ...o });
const bill = (o: Record<string, unknown> = {}) => ({
  state: 'todo', billId: 'RE-1', title: 'DSL', notes: '', dueDate: '20261001', paymentReference: '', creditorIban: '',
  bookingKeys: ['bill-b1'], lines: [line(), line({ title: 'Router', accountKey: 'a2' })], ...o,
});
const ctx = { hasBooking: true, bookingDate: '20260901', bookingNo: 7 };
const plan = (b: ReturnType<typeof bill>, input: Record<string, unknown>, c = ctx) => planBillDetailsUpdate(b, input, c);

describe('planBillDetailsUpdate', () => {
  it('refuses a draft: not-booked', () => expect(plan(bill({ state: 'draft' }), { notes: 'x' })).toEqual({ refusal: 'not-booked' }));

  it('an empty request changes nothing', () => {
    const p = plan(bill(), {});
    expect(p).toMatchObject({ billPatch: {}, linePatches: [], touchesLedger: false });
    expect(p.bookingPatch).toBeUndefined();
  });

  it('values equal to the stored ones are no change', () => {
    const p = plan(bill(), { title: 'DSL', notes: '', dueDate: '20261001', lines: [{ title: 'Internet', costCenterKey: '', projectKey: '' }, {}] });
    expect(p).toMatchObject({ billPatch: {}, linePatches: [], touchesLedger: false });
  });

  describe('notes', () => {
    it('is bill-only and never touches the ledger', () => {
      const p = plan(bill(), { notes: 'Skonto' });
      expect(p.billPatch).toEqual({ notes: 'Skonto' });
      expect(p.touchesLedger).toBe(false);
      expect(p.bookingPatch).toBeUndefined();
    });
    it('is editable on a paid bill', () => expect(plan(bill({ state: 'paid' }), { notes: 'x' }).billPatch).toEqual({ notes: 'x' }));
  });

  describe('title', () => {
    it('patches the bill, its index and the booking title and index', () => {
      const p = plan(bill(), { title: 'Glasfaser' });
      expect(p.billPatch['title']).toBe('Glasfaser');
      expect(p.billPatch['index']).toContain('Glasfaser');
      expect(p.bookingPatch).toEqual({ title: 'Kreditor RE-1 Glasfaser', index: 'd:20260901 no:7 n:Kreditor RE-1 Glasfaser' });
      expect(p.touchesLedger).toBe(true);
    });
    it('caps the booking title at 200 characters', () => expect(billBookingTitle('RE-1', 'x'.repeat(300))).toHaveLength(200));
    it('without a booking only the bill changes', () => {
      const p = plan(bill({ bookingKeys: [] }), { title: 'Neu' }, { ...ctx, hasBooking: false });
      expect(p.bookingPatch).toBeUndefined();
      expect(p.touchesLedger).toBe(false);
    });
  });

  describe('lines', () => {
    it('patches only the changed fields of the changed lines', () => {
      const p = plan(bill(), { lines: [{ title: 'Internet', costCenterKey: 'cc1' }, { projectKey: 'p1', title: 'Router 2' }] });
      expect(p.linePatches).toEqual([
        { index: 0, patch: { costCenterKey: 'cc1' } },
        { index: 1, patch: { title: 'Router 2', projectKey: 'p1' } },
      ]);
      expect((p.billPatch['lines'] as unknown[])[0]).toMatchObject({ costCenterKey: 'cc1', accountKey: 'a1', amount: 3900 });
      expect((p.billPatch['lines'] as unknown[])[1]).toMatchObject({ title: 'Router 2', projectKey: 'p1' });
      expect(p.touchesLedger).toBe(true);
    });
    it('a legacy line without projectKey counts as empty', () => {
      const legacy = bill({ lines: [{ title: 'x', accountKey: 'a1', amount: 1, vatCodeKey: '', costCenterKey: '' }] });
      expect(plan(legacy, { lines: [{ projectKey: '' }] }).linePatches).toEqual([]);
      expect(plan(legacy, { lines: [{ projectKey: 'p1' }] }).linePatches).toEqual([{ index: 0, patch: { projectKey: 'p1' } }]);
    });
    it('clearing a project is a change', () =>
      expect(plan(bill({ lines: [line({ projectKey: 'p1' })] }), { lines: [{ projectKey: '' }] }).linePatches).toEqual([{ index: 0, patch: { projectKey: '' } }]));
    it('refuses a different line count: line-count', () => expect(plan(bill(), { lines: [{}] })).toEqual({ refusal: 'line-count' }));
    it('refuses lines on a migrated bill: no-lines', () => {
      expect(plan(bill({ lines: undefined }), { lines: [{}] })).toEqual({ refusal: 'no-lines' });
      expect(plan(bill({ lines: [] }), { lines: [] })).toEqual({ refusal: 'no-lines' });
    });
    it('is allowed on a paid bill', () => expect(plan(bill({ state: 'paid' }), { lines: [{ projectKey: 'p1' }, {}] }).linePatches).toHaveLength(1));
    it('without a booking the lines change on the bill only', () => {
      const p = plan(bill({ bookingKeys: [] }), { lines: [{ projectKey: 'p1' }, {}] }, { ...ctx, hasBooking: false });
      expect(p.linePatches).toHaveLength(1);
      expect(p.touchesLedger).toBe(false);
    });
  });

  describe('payment data', () => {
    it('dueDate, paymentReference and creditorIban are bill-only', () => {
      const p = plan(bill(), { dueDate: '20261101', paymentReference: 'R1', creditorIban: 'CH93' });
      expect(p.billPatch).toEqual({ dueDate: '20261101', paymentReference: 'R1', creditorIban: 'CH93' });
      expect(p.touchesLedger).toBe(false);
    });
    it('refuses a change on a paid bill: bill-paid', () => {
      for (const input of [{ dueDate: '20261101' }, { paymentReference: 'R1' }, { creditorIban: 'CH93' }]) {
        expect(plan(bill({ state: 'paid' }), input)).toEqual({ refusal: 'bill-paid' });
      }
    });
    it('a resent unchanged value on a paid bill is fine', () =>
      expect(plan(bill({ state: 'paid' }), { dueDate: '20261001' })).toMatchObject({ billPatch: {} }));
  });
});
