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
  seriesId: '',
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

  it('emits no RRULE for a materialised series occurrence', () => {
    // Eine Serie ist in der DB expandiert: ein Dokument pro Vorkommen, und periodicity/
    // repeatUntilDate sind auf JEDES Vorkommen kopiert. Ein RRULE würde die Serie ein
    // zweites Mal expandieren — im Abo aus 10 Terminen ~100.
    const ics = buildICS('Test', [{
      ...event, seriesId: 'abc123def456ghi78', periodicity: 'weekly', repeatUntilDate: '20261231',
    }] as never);
    expect(ics).not.toContain('RRULE:FREQ=WEEKLY;UNTIL=20261231T235959');
  });

  it('still emits RRULE for a recurring event that is not materialised', () => {
    const ics = buildICS('Test', [{
      ...event, seriesId: '', periodicity: 'weekly', repeatUntilDate: '20261231',
    }] as never);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261231T235959');
  });

  it('never marks UNTIL as UTC while DTSTART is zoned', () => {
    const ics = buildICS('Test', [{
      ...event, seriesId: '', periodicity: 'weekly', repeatUntilDate: '20261231',
    }] as never);
    expect(ics).not.toContain('UNTIL=20261231T235959Z');
  });
});
