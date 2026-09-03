import { describe, expect, it } from 'vitest';

import { ReservationModel } from '@okr/shared-models';
import { reservationValidations, LOCK_REASONS } from './reservation.validations';

function make(partial: Partial<ReservationModel>): ReservationModel {
  return {
    ...new ReservationModel('scs'),
    reserver: { key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' },
    resource: { key: 'boat1', name1: '', name2: 'Gig 4x', modelType: 'resource', type: 'rboat', subType: 'b4x', label: '' },
    startDate: '20260903',
    endDate: '20260903',
    ...partial,
  } as ReservationModel;
}

describe('reservationValidations — notes', () => {
  it('requires notes when the reason is maintenance', () => {
    const result = reservationValidations(make({ reason: 'maintenance', notes: '' }), 'scs', '');
    expect(result.getErrors('notes').length).toBeGreaterThan(0);
  });

  it('requires notes when the reason is blocked', () => {
    const result = reservationValidations(make({ reason: 'blocked', notes: '' }), 'scs', '');
    expect(result.getErrors('notes').length).toBeGreaterThan(0);
  });

  it('accepts a maintenance reservation that has notes', () => {
    const result = reservationValidations(make({ reason: 'maintenance', notes: 'Riemen gebrochen' }), 'scs', '');
    expect(result.getErrors('notes').length).toBe(0);
  });

  it('does not require notes for any other reason', () => {
    for (const reason of ['social', 'course', 'party']) {
      const result = reservationValidations(make({ reason, notes: '' }), 'scs', '');
      expect(result.getErrors('notes').length).toBe(0);
    }
  });

  it('exports the two lock reasons', () => {
    expect(LOCK_REASONS).toEqual(['maintenance', 'blocked']);
  });
});
