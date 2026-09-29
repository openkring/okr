import { describe, expect, it } from 'vitest';
import { journalBookingDoc } from './journal.mapper';

describe('journalBookingDoc', () => {
  it('never writes the fields the migration owns (periodKey, documentKey, documentKeys)', () => {
    const d = journalBookingDoc({ id: 59, description: 'Miete', date: '2026-01-05T00:00:00+01:00' }, '20260105', 'scs');
    expect(d).not.toHaveProperty('periodKey');
    expect(d).not.toHaveProperty('documentKey');
    expect(d).not.toHaveProperty('documentKeys');
    expect(d).toMatchObject({ title: 'Miete', date: '20260105', bookingNo: 59, status: 'posted', accountingTenantId: 'scs' });
  });
});
