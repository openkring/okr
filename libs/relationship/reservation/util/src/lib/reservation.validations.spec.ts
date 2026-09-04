import { describe, expect, it } from 'vitest';

import { ReservationModel } from '@okr/shared-models';
import { reservationValidations } from './reservation.validations';
import { LOCK_REASONS } from './reservation.util';

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

describe('reservationValidations — description', () => {
  it('requires description when the reason is maintenance', () => {
    const result = reservationValidations(make({ reason: 'maintenance', description: '' }), 'scs', '');
    expect(result.getErrors('description').length).toBeGreaterThan(0);
  });

  it('requires description when the reason is blocked', () => {
    const result = reservationValidations(make({ reason: 'blocked', description: '' }), 'scs', '');
    expect(result.getErrors('description').length).toBeGreaterThan(0);
  });

  it('accepts a maintenance reservation that has a description', () => {
    const result = reservationValidations(make({ reason: 'maintenance', description: 'Riemen gebrochen' }), 'scs', '');
    expect(result.getErrors('description').length).toBe(0);
  });

  it('does not require a description for any other reason', () => {
    for (const reason of ['social', 'course', 'party']) {
      const result = reservationValidations(make({ reason, description: '' }), 'scs', '');
      expect(result.getErrors('description').length).toBe(0);
    }
  });

  it('exports the two lock reasons', () => {
    expect(LOCK_REASONS).toEqual(['maintenance', 'blocked']);
  });
});
