import { describe, expect, it } from 'vitest';

import { eventTransitTimes } from './transit-event.util';

const now = Date.parse('2026-11-01T08:00:00Z');

describe('eventTransitTimes', () => {
  it('arrives 10 minutes before the start, read on the Swiss wall clock', () => {
    // 19:00 CET = 18:00 UTC
    const t = eventTransitTimes({ startDate: '20261105', startTime: '19:00', fullDay: false, durationMinutes: 90 }, now);
    expect(t).toEqual({ at: '2026-11-05T17:50:00.000Z', returnAt: '2026-11-05T19:30:00.000Z' });
  });

  it('uses summer time in summer', () => {
    const t = eventTransitTimes({ startDate: '20270701', startTime: '18:00', fullDay: false, durationMinutes: 60 }, now);
    expect(t?.at).toBe('2027-07-01T15:50:00.000Z');
  });

  it('aims at 09:00 for a full-day event and offers no return', () => {
    const t = eventTransitTimes({ startDate: '20261105', startTime: '', fullDay: true, durationMinutes: 1440 }, now);
    expect(t).toEqual({ at: '2026-11-05T08:00:00.000Z', returnAt: '' });
  });

  it('is undefined for a past event or an unreadable date', () => {
    expect(eventTransitTimes({ startDate: '20261031', startTime: '10:00', fullDay: false, durationMinutes: 60 }, now)).toBeUndefined();
    expect(eventTransitTimes({ startDate: '20261030', startTime: '', fullDay: true, durationMinutes: 1440 }, now)).toBeUndefined();
    expect(eventTransitTimes({ startDate: '', startTime: '10:00', fullDay: false, durationMinutes: 60 }, now)).toBeUndefined();
  });

  it('still shows a running event and a multi-day event until its last day', () => {
    expect(eventTransitTimes({ startDate: '20261101', startTime: '08:30', fullDay: false, durationMinutes: 120 }, now)).toBeDefined();
    expect(eventTransitTimes({ startDate: '20261030', endDate: '20261102', startTime: '', fullDay: true, durationMinutes: 1440 }, now)).toBeDefined();
  });
});
