import { describe, expect, it } from 'vitest';
import { approveBlocker } from './approve.util';

const order = { status: 'draft', createdBy: 'u1', debitAccountKey: 'acc', executionDate: '20261015' };

describe('approveBlocker', () => {
  it('passes a prepared draft with a different approver', () => expect(approveBlocker(order, [{}], 'u2')).toBe(''));
  it('blocks a non-draft order', () => expect(approveBlocker({ ...order, status: 'approved' }, [{}], 'u2')).toBe('not-draft'));
  it('blocks a collecting order nobody prepared yet', () =>
    expect(approveBlocker({ ...order, createdBy: 'system' }, [{}], 'u2')).toBe('unprepared'));
  it('blocks the creator approving their own order', () => expect(approveBlocker(order, [{}], 'u1')).toBe('self'));
  it('blocks an empty approver key', () => expect(approveBlocker(order, [{}], '')).toBe('self'));
  it('blocks a missing debit account', () => expect(approveBlocker({ ...order, debitAccountKey: '' }, [{}], 'u2')).toBe('incomplete'));
  it('blocks a missing execution date', () => expect(approveBlocker({ ...order, executionDate: '' }, [{}], 'u2')).toBe('incomplete'));
  it('blocks an order without payments', () => expect(approveBlocker(order, [], 'u2')).toBe('empty'));
  it('blocks while a payment needs review', () =>
    expect(approveBlocker(order, [{}, { needsReview: true }], 'u2')).toBe('needs-review'));
});
