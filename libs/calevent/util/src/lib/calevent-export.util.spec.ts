import { CalEventModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl } from './calevent-export.util';

function event(patch: Partial<CalEventModel>): CalEventModel {
  return Object.assign(new CalEventModel('scs'), { name: 'Regatta', description: '', locationKey: '' }, patch);
}

function params(url: string | undefined): URLSearchParams {
  expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  return new URL(url as string).searchParams;
}

describe('buildGoogleCalendarUrl', () => {
  it('emits local wall-clock times with ctz and no Z', () => {
    const p = params(buildGoogleCalendarUrl(event({ startDate: '20260813', startTime: '18:00', durationMinutes: 90 })));
    expect(p.get('dates')).toBe('20260813T180000/20260813T193000');
    expect(p.get('ctz')).toBe('Europe/Zurich');
    expect(p.get('action')).toBe('TEMPLATE');
    expect(p.get('text')).toBe('Regatta');
  });

  it('rolls over midnight', () => {
    const p = params(buildGoogleCalendarUrl(event({ startDate: '20261231', startTime: '23:30', durationMinutes: 60 })));
    expect(p.get('dates')).toBe('20261231T233000/20270101T003000');
  });

  it('uses an exclusive end for a full-day event', () => {
    const p = params(buildGoogleCalendarUrl(event({ startDate: '20260228', fullDay: true, endDate: '' })));
    expect(p.get('dates')).toBe('20260228/20260301');
  });

  it('spans a multi-day full-day event up to the day after endDate', () => {
    const p = params(buildGoogleCalendarUrl(event({ startDate: '20260810', fullDay: true, endDate: '20260812' })));
    expect(p.get('dates')).toBe('20260810/20260813');
  });

  it('takes the location name from name@key and passes the description', () => {
    const p = params(buildGoogleCalendarUrl(event({ startDate: '20260813', startTime: '18:00', locationKey: 'Bootshaus@abc', description: 'Mitbringen: Schwimmweste' })));
    expect(p.get('location')).toBe('Bootshaus');
    expect(p.get('details')).toBe('Mitbringen: Schwimmweste');
  });

  it('is undefined without a valid start date', () => {
    expect(buildGoogleCalendarUrl(event({ startDate: '' }))).toBeUndefined();
  });
});
