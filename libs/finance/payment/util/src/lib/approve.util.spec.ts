import { describe, expect, it } from 'vitest';
import { approveBlocker } from './approve.util';

const order = { status: 'draft', createdBy: 'u1', debitAccountKey: 'acc', executionDate: '20261015' };

describe('approveBlocker', () => {
  it('passes a prepared draft', () => expect(approveBlocker(order, [{}])).toBe(''));
  it('blocks a non-draft order', () => expect(approveBlocker({ ...order, status: 'approved' }, [{}])).toBe('not-draft'));
  it('blocks a collecting order nobody prepared yet', () =>
    expect(approveBlocker({ ...order, createdBy: 'system' }, [{}])).toBe('unprepared'));
  it('lets the treasurer who prepared the order release it (four-eyes is in e-banking, spec 1.80 §5.5)', () =>
    expect(approveBlocker(order, [{}])).toBe(''));
  it('blocks a missing debit account', () => expect(approveBlocker({ ...order, debitAccountKey: '' }, [{}])).toBe('incomplete'));
  it('blocks a missing execution date', () => expect(approveBlocker({ ...order, executionDate: '' }, [{}])).toBe('incomplete'));
  it('blocks an order without payments', () => expect(approveBlocker(order, [])).toBe('empty'));
  it('blocks while a payment needs review', () =>
    expect(approveBlocker(order, [{}, { needsReview: true }])).toBe('needs-review'));
});
