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
  it('settles a processing expense', () => {
    expect(nextStatusForCompletedTask('expense.e1', { status: 'processing' })).toBe('done');
  });
  it('is a no-op on a done expense', () => {
    // reviewBooking closes the task IN THE SAME TRANSACTION that sets 'done' (approve),
    // so this case fires on every approved booking.
    expect(nextStatusForCompletedTask('expense.e1', { status: 'done' })).toBeUndefined();
  });
  it('never revives a cancelled expense', () => {
    expect(nextStatusForCompletedTask('expense.e1', { status: 'cancelled' })).toBeUndefined();
  });
  it('ignores a task that does not link to an expense', () => {
    expect(nextStatusForCompletedTask('trip.t1', { status: 'processing' })).toBeUndefined();
    expect(nextStatusForCompletedTask('', { status: 'processing' })).toBeUndefined();
  });
});
