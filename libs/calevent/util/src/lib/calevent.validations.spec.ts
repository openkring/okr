import { describe, expect, it } from 'vitest';

import { CalEventModel } from '@okr/shared-models';

import { calEventValidations } from './calevent.validations';

function makeEvent(overrides: Partial<CalEventModel> = {}): CalEventModel {
  return { ...new CalEventModel(), name: 'Training', startDate: '20260901', tenants: ['scs'], ...overrides } as CalEventModel;
}

describe('calEventValidations', () => {
  it('accepts a new recurring event that has no seriesId yet', () => {
    // the store assigns seriesId at save time -- requiring it here blocked the save entirely
    const result = calEventValidations(makeEvent({ periodicity: 'weekly', repeatUntilDate: '20261001', seriesId: '' }), 'scs', '');
    expect(result.getErrors('seriesId')).toEqual([]);
    expect(result.isValid()).toBe(true);
  });

  it('accepts a legacy event whose seriesId field is missing', () => {
    const result = calEventValidations(makeEvent({ seriesId: undefined as unknown as string }), 'scs', '');
    expect(result.getErrors('seriesId')).toEqual([]);
  });

  it('still demands a repeatUntilDate after the start date on a recurring event', () => {
    const missing = calEventValidations(makeEvent({ periodicity: 'weekly', repeatUntilDate: '' }), 'scs', '');
    expect(missing.getErrors('repeatUntilDate').length).toBeGreaterThan(0);

    const beforeStart = calEventValidations(makeEvent({ periodicity: 'weekly', repeatUntilDate: '20260801' }), 'scs', '');
    expect(beforeStart.getErrors('repeatUntilDate').length).toBeGreaterThan(0);
  });

  it('rejects an oversized series', () => {
    const result = calEventValidations(makeEvent({ periodicity: 'daily', repeatUntilDate: '20280901' }), 'scs', '');
    expect(result.getErrors('repeatUntilDate')).toContain('caleventMaxDatesPerSeries');
  });
});
