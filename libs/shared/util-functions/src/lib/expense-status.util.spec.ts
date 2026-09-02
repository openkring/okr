import { describe, it, expect } from 'vitest';
import { lockedExpenseFields, nextStatusForCompletedTask } from './expense-status.util';

describe('lockedExpenseFields', () => {
  it('locks nothing while the expense is unbooked', () => {
    expect(lockedExpenseFields({ bookingKey: '' })).toEqual([]);
  });
  it('locks the accounting fields once a booking exists', () => {
    expect(lockedExpenseFields({ bookingKey: 'b1' })).toEqual(['amountTotal', 'currency', 'transferTo']);
  });
  it('treats a missing bookingKey as unbooked (legacy documents)', () => {
    expect(lockedExpenseFields({})).toEqual([]);
  });
});

describe('nextStatusForCompletedTask', () => {
  it('moves a validated-pending expense to validated', () => {
    expect(nextStatusForCompletedTask('expense.e1', { status: 'processing' })).toBe('validated');
  });
  it('never demotes a posted expense', () => {
    // reviewBooking closes the task IN THE SAME TRANSACTION that sets 'posted'
    // (booking/index.ts:155-159), so this case fires on every approved booking.
    expect(nextStatusForCompletedTask('expense.e1', { status: 'posted' })).toBeUndefined();
  });
  it('ignores a task that does not link to an expense', () => {
    expect(nextStatusForCompletedTask('trip.t1', { status: 'processing' })).toBeUndefined();
    expect(nextStatusForCompletedTask('', { status: 'processing' })).toBeUndefined();
  });
  it('is a no-op when the expense is already validated', () => {
    expect(nextStatusForCompletedTask('expense.e1', { status: 'validated' })).toBeUndefined();
  });
});
