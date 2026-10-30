import { describe, expect, it } from 'vitest';

import { CalEventModel } from '@okr/shared-models';

import { isCaleventAttendanceClosed } from './calevent-attendance.util';
import { DateFormat, getTodayStr } from './date.util';

const TODAY = getTodayStr(DateFormat.StoreDate);
const PAST = '20200101';
const FUTURE = '29991231';

function event(overrides: Partial<CalEventModel> = {}): CalEventModel {
  return Object.assign(new CalEventModel('scs'), { startDate: FUTURE, endDate: '' }, overrides);
}

describe('isCaleventAttendanceClosed', () => {
  it('is open for a future, unlocked, definitive event', () => {
    expect(isCaleventAttendanceClosed(event())).toBe(false);
  });

  it('is open for an event happening today', () => {
    expect(isCaleventAttendanceClosed(event({ startDate: TODAY }))).toBe(false);
  });

  it('is open for a multi-day event that started in the past and ends in the future', () => {
    expect(isCaleventAttendanceClosed(event({ startDate: PAST, endDate: FUTURE }))).toBe(false);
  });

  it('is closed for a past event', () => {
    expect(isCaleventAttendanceClosed(event({ startDate: PAST }))).toBe(true);
  });

  it('is closed when the endDate is past', () => {
    expect(isCaleventAttendanceClosed(event({ startDate: PAST, endDate: '20200102' }))).toBe(true);
  });

  it('is closed for a locked event', () => {
    expect(isCaleventAttendanceClosed(event({ isLocked: true }))).toBe(true);
  });

  it('is closed for a cancelled event', () => {
    expect(isCaleventAttendanceClosed(event({ state: 'cancelled' }))).toBe(true);
  });

  it('treats a legacy doc without isLocked/state as open', () => {
    const legacy = { startDate: FUTURE, endDate: '' } as unknown as CalEventModel;
    expect(isCaleventAttendanceClosed(legacy)).toBe(false);
  });
});
