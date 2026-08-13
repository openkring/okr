import { describe, expect, it } from 'vitest';
import { buildICS } from './index';

const event = {
  okey: 'e1',
  name: 'Regatta',
  description: '',
  startDate: '20260813',
  startTime: '18:00',
  fullDay: false,
  durationMinutes: 90,
  endDate: '',
  periodicity: 'once',
  repeatUntilDate: '',
  locationKey: '',
  url: '',
  isArchived: false,
  calendars: [],
  tenants: [],
};

describe('buildICS', () => {
  it('emits local wall-clock times with TZID, never a UTC Z suffix', () => {
    const ics = buildICS('Test', [event] as never);
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20260813T180000');
    expect(ics).toContain('DTEND;TZID=Europe/Zurich:20260813T193000');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).not.toMatch(/DT(START|END)[^\r\n]*Z\r?\n/);
  });

  it('rolls the end time over midnight', () => {
    const ics = buildICS('Test', [{ ...event, startTime: '23:30', durationMinutes: 60 }] as never);
    expect(ics).toContain('DTEND;TZID=Europe/Zurich:20260814T003000');
  });
});
