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

  it('appends an app deep link to the description, with the requested listId', () => {
    const ics = buildICS('Test', [event] as never, {
      appOrigin: 'https://app.seeclub.org',
      listIdFor: () => 'scs',
    });
    expect(ics).toContain('https://app.seeclub.org/calevent/scs/c-calevents?event=e1');
  });

  it('uses the deep link as URL only when the event has none of its own', () => {
    const withOwn = buildICS('Test', [{ ...event, url: 'https://regatta.example' }] as never,
      { appOrigin: 'https://app.seeclub.org', listIdFor: () => 'my' });
    expect(withOwn).toContain('URL:https://regatta.example');
    expect(withOwn).not.toContain('URL:https://app.seeclub.org');

    const without = buildICS('Test', [event] as never,
      { appOrigin: 'https://app.seeclub.org', listIdFor: () => 'my' });
    expect(without).toContain('URL:https://app.seeclub.org/calevent/my/c-calevents?event=e1');
  });

  it('emits the subscriber attendance as ATTENDEE/PARTSTAT', () => {
    const ics = buildICS('Test', [event] as never, {
      attendee: { cn: 'Bruno Kaiser', email: 'bruno@example.org' },
      partstatFor: () => 'ACCEPTED',
    });
    expect(ics).toContain('ATTENDEE;CN=Bruno Kaiser;PARTSTAT=ACCEPTED:mailto:bruno@example.org');
  });

  it('omits ATTENDEE when the subscriber has no invitation for that event', () => {
    const ics = buildICS('Test', [event] as never, {
      attendee: { cn: 'Bruno Kaiser', email: 'bruno@example.org' },
      partstatFor: () => undefined,
    });
    expect(ics).not.toContain('ATTENDEE');
  });

  it('stays byte-compatible for callers that pass no options', () => {
    const ics = buildICS('Test', [event] as never);
    expect(ics).not.toContain('ATTENDEE');
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20260813T180000');
  });

  it('quotes the ATTENDEE CN parameter when it contains a comma', () => {
    const ics = buildICS('Test', [event] as never, {
      attendee: { cn: 'Kaiser, Bruno', email: 'bruno@example.org' },
      partstatFor: () => 'ACCEPTED',
    });
    expect(ics).toContain('ATTENDEE;CN="Kaiser, Bruno";PARTSTAT=ACCEPTED:mailto:bruno@example.org');
    // Ensure it's not using the wrong escaping mechanism
    expect(ics).not.toContain('CN=Kaiser\\, Bruno');
  });

  it('removes embedded double quotes from ATTENDEE CN before quoting', () => {
    const ics = buildICS('Test', [event] as never, {
      attendee: { cn: 'Bruno "Speedy" Kaiser', email: 'bruno@example.org' },
      partstatFor: () => 'ACCEPTED',
    });
    // The CN value should be quoted and stripped of embedded quotes
    expect(ics).toContain('CN="Bruno Speedy Kaiser"');
    // Ensure the removed quotes don't appear in the output
    expect(ics).not.toContain('"Speedy"');
  });
});
