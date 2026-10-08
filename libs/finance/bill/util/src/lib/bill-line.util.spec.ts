import { describe, expect, it } from 'vitest';

import { BillModel } from '@okr/shared-models';

import { billDetailsPayload, billLinesTotal, isDraftBill, lineCostCenterFallback, newBillLine, showLineCostCenter, showLineProject, toBillLines, withLineAccount } from './bill-line.util';
import { billLinesValidations } from './bill-line.validations';

describe('bill lines', () => {
  it('a new line, the total and the editable copy of a legacy doc', () => {
    expect(newBillLine('scs0238', 3900, 'DSL')).toEqual({ title: 'DSL', accountKey: 'scs0238', amount: 3900, vatCodeKey: '', costCenterKey: '', projectKey: '' });
    expect(billLinesTotal([newBillLine('a', 100), newBillLine('b', 250)])).toBe(350);
    expect(toBillLines({} as BillModel)).toEqual([]);
    expect(toBillLines({ lines: [{ accountKey: 'a', amount: 1 }] } as never)).toEqual([newBillLine('a', 1)]);
  });

  it('only a draft without a booking is editable', () => {
    expect(isDraftBill({ state: 'draft', bookingKeys: [] })).toBe(true);
    expect(isDraftBill({ state: 'draft' } as never)).toBe(true);
    expect(isDraftBill({ state: 'draft', bookingKeys: ['bill-k'] })).toBe(false);
    expect(isDraftBill({ state: 'todo', bookingKeys: [] })).toBe(false);
  });

  it('validates per row and the list', () => {
    expect(billLinesValidations([newBillLine('a', 100)]).isValid()).toBe(true);
    expect(billLinesValidations([]).getErrors('lines').length).toBe(1);
    const r = billLinesValidations([newBillLine('', 0)]);
    expect(r.getErrors('lines[0].accountKey').length).toBe(1);
    expect(r.getErrors('lines[0].amount').length).toBe(1);
    expect(billLinesValidations([newBillLine('a', 10.5)]).getErrors('lines[0].amount').length).toBe(1);
  });

  describe('cost centre and project per line (spec 1.92)', () => {
    const accounts = [{ okey: 'exp', id: '4000' }, { okey: 'bs', id: '1020' }] as never[];
    const line = (o = {}) => ({ ...newBillLine('exp', 100), ...o });

    it('keeps the stored projectKey and cost centre on the editable copy; legacy lines get empty ones', () => {
      expect(toBillLines({ lines: [{ accountKey: 'exp', amount: 5, costCenterKey: 'cc1', projectKey: 'p1' }] } as never)[0]).toMatchObject({ costCenterKey: 'cc1', projectKey: 'p1' });
      expect(toBillLines({ lines: [{ accountKey: 'exp', amount: 5 }] } as never)[0].projectKey).toBe('');
    });

    it('cost-centre picker: P&L lines of books with cost centres only', () => {
      expect(showLineCostCenter(line(), accounts, true)).toBe(true);
      expect(showLineCostCenter(line(), accounts, false)).toBe(false);
      expect(showLineCostCenter(line({ accountKey: 'bs' }), accounts, true)).toBe(false);
    });

    it('project picker: P&L line and an active project (or one already set)', () => {
      const active = [{ isArchived: false }];
      const archived = [{ isArchived: true }];
      expect(showLineProject(line(), accounts, active)).toBe(true);
      expect(showLineProject(line(), accounts, [])).toBe(false);
      expect(showLineProject(line(), accounts, archived)).toBe(false);
      expect(showLineProject(line({ projectKey: 'p1' }), accounts, archived)).toBe(true);
      expect(showLineProject(line({ accountKey: 'bs' }), accounts, active)).toBe(false);
    });

    it('cost-centre fallback: account default, else book default, only when an active leaf', () => {
      const cc = [{ okey: 'cc1', accountingTenantId: 't', type: 'leaf' }] as never[];
      const accs = [{ okey: 'exp', id: '4000', accountingTenantId: 't', costCenterKey: 'cc1' }] as never[];
      expect(lineCostCenterFallback(line(), accs, cc)).toBe('cc1');
      expect(lineCostCenterFallback(line(), accs, [])).toBe('');
      expect(lineCostCenterFallback(line({ accountKey: 'x' }), accs, cc, 'cc1')).toBe('');
    });

    it('moving to a balance-sheet account drops both; an unknown account changes nothing else', () => {
      const l = line({ costCenterKey: 'cc1', projectKey: 'p1' });
      expect(withLineAccount(l, 'bs', accounts)).toMatchObject({ accountKey: 'bs', costCenterKey: '', projectKey: '' });
      expect(withLineAccount(l, 'exp', accounts)).toMatchObject({ accountKey: 'exp', costCenterKey: 'cc1', projectKey: 'p1' });
      expect(withLineAccount(l, 'zzz', [])).toMatchObject({ accountKey: 'zzz', costCenterKey: 'cc1', projectKey: 'p1' });
    });
  });
});

describe('billDetailsPayload', () => {
  const bill = { okey: 'b1', title: 'T', notes: 'N', dueDate: '20261101', paymentReference: 'R', creditorIban: 'CH93', state: 'todo' } as BillModel;
  const lines = [{ ...newBillLine('a', 100, 'x'), costCenterKey: 'cc', projectKey: 'p' }];

  it('sends the header, the payment data and the editable line fields', () => {
    expect(billDetailsPayload(bill, lines)).toEqual({
      billKey: 'b1', title: 'T', notes: 'N', dueDate: '20261101', paymentReference: 'R', creditorIban: 'CH93',
      lines: [{ title: 'x', costCenterKey: 'cc', projectKey: 'p' }],
    });
  });

  it('leaves the payment data out of a paid bill', () => {
    const p = billDetailsPayload({ ...bill, state: 'paid' } as BillModel, lines);
    expect(p.dueDate).toBeUndefined();
    expect(p.paymentReference).toBeUndefined();
    expect(p.creditorIban).toBeUndefined();
  });

  it('sends no lines for a bill without any and coalesces legacy gaps', () => {
    const p = billDetailsPayload({ okey: 'b1', state: 'todo' } as BillModel, []);
    expect(p.lines).toBeUndefined();
    expect(p).toMatchObject({ title: '', notes: '', dueDate: '' });
    expect(billDetailsPayload(bill, [{ title: 'x', accountKey: 'a', amount: 1 } as never]).lines).toEqual([{ title: 'x', costCenterKey: '', projectKey: '' }]);
  });
});
