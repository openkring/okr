import { describe, expect, it } from 'vitest';

import { CalEventModel } from '@okr/shared-models';

import { calEventValidations } from './calevent.validations';

function makeEvent(overrides: Partial<CalEventModel> = {}): CalEventModel {
  return { ...new CalEventModel('scs'), name: 'Training', startDate: '20260901', tenants: ['scs'], ...overrides } as CalEventModel;
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

describe('calEventValidations — mandatory name', () => {
  // Vest reports only the FIRST failing test per field, so these assert the key that actually
  // surfaces, not every rule that would fail.
  it('rejects an event without a name', () => {
    const result = calEventValidations(makeEvent({ name: '' }), 'scs', '');
    expect(result.getErrors('name')).toContain('required');
    expect(result.isValid()).toBe(false);
  });

  it('rejects a name made of blanks', () => {
    // 'required' is isNotBlank, not isNotEmpty — spaces do not satisfy it
    expect(calEventValidations(makeEvent({ name: '   ' }), 'scs', '').isValid()).toBe(false);
  });

  it('rejects a legacy event whose name field is missing', () => {
    const result = calEventValidations(makeEvent({ name: undefined as unknown as string }), 'scs', '');
    expect(result.getErrors('name').length).toBeGreaterThan(0);
    expect(result.isValid()).toBe(false);
  });

  it('accepts a named event', () => {
    const result = calEventValidations(makeEvent({ name: '4X-Dienstag' }), 'scs', '');
    expect(result.getErrors('name')).toEqual([]);
    expect(result.isValid()).toBe(true);
  });

  it('demands the name on a recurring event too, not just on a single one', () => {
    const result = calEventValidations(
      makeEvent({ name: '', periodicity: 'weekly', repeatUntilDate: '20261001' }), 'scs', '');
    expect(result.getErrors('name')).toContain('required');
    expect(result.isValid()).toBe(false);
  });

  it('demands the name on a poll-born series occurrence too', () => {
    const result = calEventValidations(
      makeEvent({ name: '', pollMultiSelect: true, seriesId: 'p123456789012345678', periodicity: 'once' }), 'scs', '');
    expect(result.getErrors('name')).toContain('required');
  });

  it('now enforces the length cap as well', () => {
    // the cap rode along: stringValidations gates maxLength on the SAME isMandatory flag, so
    // before this change a 51-character name was accepted despite baseValidations passing NAME_LENGTH
    const result = calEventValidations(makeEvent({ name: 'x'.repeat(51) }), 'scs', '');
    expect(result.getErrors('name')).toContain('tooLong');
    expect(result.isValid()).toBe(false);
  });

  it('accepts a name of exactly the maximum length', () => {
    expect(calEventValidations(makeEvent({ name: 'x'.repeat(50) }), 'scs', '').isValid()).toBe(true);
  });
});
