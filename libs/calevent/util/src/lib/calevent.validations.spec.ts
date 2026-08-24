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

  it('still demands a repeatUntilDate that is not before the start date on a recurring event', () => {
    const missing = calEventValidations(makeEvent({ periodicity: 'weekly', repeatUntilDate: '' }), 'scs', '');
    expect(missing.getErrors('repeatUntilDate').length).toBeGreaterThan(0);

    const beforeStart = calEventValidations(makeEvent({ periodicity: 'weekly', repeatUntilDate: '20260801' }), 'scs', '');
    expect(beforeStart.getErrors('repeatUntilDate')).toContain('caleventRepeatUntilDateNotBeforeStartDate');
  });

  it('accepts repeatUntilDate === startDate — the last occurrence of a materialised series', () => {
    // every occurrence carries the series' repeatUntilDate, so on the last one the two are equal.
    // Demanding 'strictly after' made those events permanently unsavable.
    const lastOccurrence = calEventValidations(makeEvent({ periodicity: 'weekly', repeatUntilDate: '20260901' }), 'scs', '');
    expect(lastOccurrence.getErrors('repeatUntilDate')).toEqual([]);
    expect(lastOccurrence.isValid()).toBe(true);
  });

  it('rejects an oversized series', () => {
    const result = calEventValidations(makeEvent({ periodicity: 'daily', repeatUntilDate: '20280901' }), 'scs', '');
    expect(result.getErrors('repeatUntilDate')).toContain('caleventMaxDatesPerSeries');
  });
});

describe('calEventValidations — poll-born series', () => {
  it('rejects a periodicity other than "once" on a poll-born series', () => {
    // the dates of a poll-born series are irregular; re-expanding them from a rule would archive
    // every sibling date as "surplus" (planSeriesReconcile). The periodicity must stay locked.
    const result = calEventValidations(
      makeEvent({ pollMultiSelect: true, seriesId: 'p123456789012345678', periodicity: 'weekly', repeatUntilDate: '20261001' }), 'scs', '');
    expect(result.getErrors('periodicity')).toContain('caleventPollSeriesPeriodicityLocked');
    expect(result.isValid()).toBe(false);
  });

  it('accepts a poll-born series that keeps periodicity "once"', () => {
    const result = calEventValidations(
      makeEvent({ pollMultiSelect: true, seriesId: 'p123456789012345678', periodicity: 'once' }), 'scs', '');
    expect(result.getErrors('periodicity')).toEqual([]);
    expect(result.isValid()).toBe(true);
  });

  it('leaves an ordinary recurring event alone', () => {
    const result = calEventValidations(
      makeEvent({ periodicity: 'weekly', repeatUntilDate: '20261001' }), 'scs', '');
    expect(result.getErrors('periodicity')).toEqual([]);
  });

  it('treats a legacy event without the pollMultiSelect field as an ordinary event', () => {
    const result = calEventValidations(
      makeEvent({ pollMultiSelect: undefined as unknown as boolean, periodicity: 'weekly', repeatUntilDate: '20261001' }), 'scs', '');
    expect(result.getErrors('periodicity')).toEqual([]);
  });
});
