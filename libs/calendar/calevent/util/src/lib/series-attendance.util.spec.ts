import { AvatarInfo, CalEventModel, InvitationModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { buildSeriesAttendanceTable, canRespondToCalevent } from './series-attendance.util';

const FUTURE = '20990101';
const PAST = '20200101';

function avatar(key: string, name1: string, name2: string): AvatarInfo {
  return { key, name1, name2, modelType: 'person', type: '', subType: '', label: '' };
}

function event(okey: string, startDate: string, overrides: Partial<CalEventModel> = {}): CalEventModel {
  return {
    ...new CalEventModel('scs'),
    okey, startDate, startTime: '18:00', name: 'Achter', seriesId: 'series1', state: 'definitive',
    ...overrides,
  } as CalEventModel;
}

function invitation(okey: string, caleventKey: string, inviteeKey: string, overrides: Partial<InvitationModel> = {}): InvitationModel {
  return {
    ...new InvitationModel('scs'),
    okey, caleventKey, inviteeKey, inviteeFirstName: 'Anna', inviteeLastName: 'Muster',
    ...overrides,
  } as InvitationModel;
}

const me = { key: 'p1', firstName: 'Bruno', lastName: 'Kaiser' };

describe('canRespondToCalevent', () => {
  it('lets anybody within the reach of the calendar answer', () => {
    expect(canRespondToCalevent(event('e1', FUTURE), [], 'p1', true)).toBe(true);
  });

  it('needs an invitation outside that reach', () => {
    const out = event('e1', FUTURE);
    expect(canRespondToCalevent(out, [], 'p1', false)).toBe(false);
    expect(canRespondToCalevent(out, [invitation('i1', 'e1', 'p1')], 'p1', false)).toBe(true);
  });

  it('ignores an invitation addressed to somebody else', () => {
    expect(canRespondToCalevent(event('e1', FUTURE), [invitation('i1', 'e1', 'p2')], 'p1', false)).toBe(false);
  });

  it('ignores a withdrawn (archived) invitation', () => {
    const invitations = [invitation('i1', 'e1', 'p1', { isArchived: true })];
    expect(canRespondToCalevent(event('e1', FUTURE), invitations, 'p1', false)).toBe(false);
  });
});

describe('buildSeriesAttendanceTable', () => {
  it('drops past, archived, cancelled and proposed occurrences', () => {
    const events = [
      event('e1', PAST),
      event('e2', FUTURE, { isArchived: true }),
      event('e3', FUTURE, { state: 'cancelled' }),
      event('e4', FUTURE, { state: 'proposed' }),
      event('e5', FUTURE),
    ];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.columns.map(c => c.id)).toEqual(['e5']);
  });

  it('sorts the columns by date and time and blanks the time of a full-day event', () => {
    const events = [
      event('e2', '20990310', { startTime: '18:00' }),
      event('e3', '20990310', { startTime: '07:00' }),
      event('e1', '20990201', { fullDay: true }),
    ];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.columns.map(c => c.id)).toEqual(['e1', 'e3', 'e2']);
    expect(table.columns[0].startTime).toBe('');
  });

  it('reads every answer from the attendees list', () => {
    const events = [event('e1', FUTURE, {
      attendees: [
        { person: avatar('p1', 'Bruno', 'Kaiser'), state: 'accepted' },
        { person: avatar('p2', 'Anna', 'Muster'), state: 'invited' },
      ],
    })];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.rows.map(r => r.key)).toEqual(['p1', 'p2']);
    expect(table.rows[0].responses['e1']).toBe('accepted');
    expect(table.rows[1].responses['e1']).toBe('pending');   // 'invited' = still unanswered
    expect(table.columns[0].locked).toBe(false);
  });

  it('lets the attendee entry win over a stale invitation state', () => {
    // The regression this replaces: the invitation loop ran AFTER the attendee loop and overwrote
    // it, so a sign-up made after the invitation was sent still showed as pending.
    const events = [event('e1', FUTURE, {
      attendees: [{ person: avatar('p1', 'Bruno', 'Kaiser'), state: 'accepted' }],
    })];
    const invitations = [invitation('i1', 'e1', 'p1', { state: 'pending' })];
    const table = buildSeriesAttendanceTable(events, invitations, me);
    expect(table.rows[0].responses['e1']).toBe('accepted');
  });

  it('locks an occurrence outside the reach that the user was not invited to', () => {
    const events = [event('e1', FUTURE), event('e2', '20990102')];
    const table = buildSeriesAttendanceTable(events, [invitation('i1', 'e1', 'p1')], me, false);
    expect(table.columns.find(c => c.id === 'e1')?.locked).toBe(false);
    expect(table.columns.find(c => c.id === 'e2')?.locked).toBe(true);
  });

  it('keeps one row per person across the whole series', () => {
    const anna = avatar('p2', 'Anna', 'Muster');
    const events = [
      event('e1', '20990101', { attendees: [{ person: anna, state: 'accepted' }] }),
      event('e2', '20990108', { attendees: [{ person: anna, state: 'declined' }] }),
    ];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.rows.find(r => r.key === 'p2')?.responses).toEqual({ e1: 'accepted', e2: 'declined' });
  });

  it('puts the current user first and keeps a row even without any answer', () => {
    const events = [event('e1', FUTURE, {
      attendees: [{ person: avatar('p2', 'Anna', 'Auer'), state: 'accepted' }],
    })];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.rows.map(r => r.key)).toEqual(['p1', 'p2']);
    expect(table.rows[0].responses).toEqual({});
  });

  it('creates no row from an invitation — only attendees and the current user get one', () => {
    const events = [event('e1', FUTURE)];
    const invitations = [
      invitation('i1', 'e1', 'p2'),
      invitation('i2', 'gone', 'p3'),
    ];
    const table = buildSeriesAttendanceTable(events, invitations, me);
    expect(table.rows.map(r => r.key)).toEqual(['p1']);
  });

  it('returns an empty table for a series without upcoming occurrences', () => {
    const table = buildSeriesAttendanceTable([event('e1', PAST)], [], me);
    expect(table.columns).toEqual([]);
    expect(table.isDraft).toBe(false);
    expect(table.name).toBe('Achter');   // falls back to the series name so the header stays filled
  });
});
