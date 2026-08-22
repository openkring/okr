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
  it('lets anybody answer an open event', () => {
    expect(canRespondToCalevent(event('e1', FUTURE, { isOpen: true }), [], 'p1')).toBe(true);
  });

  it('needs an invitation on a closed event', () => {
    const closed = event('e1', FUTURE, { isOpen: false });
    expect(canRespondToCalevent(closed, [], 'p1')).toBe(false);
    expect(canRespondToCalevent(closed, [invitation('i1', 'e1', 'p1')], 'p1')).toBe(true);
  });

  it('ignores an invitation addressed to somebody else', () => {
    const closed = event('e1', FUTURE, { isOpen: false });
    expect(canRespondToCalevent(closed, [invitation('i1', 'e1', 'p2')], 'p1')).toBe(false);
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

  it('reads answers of an open event from the attendees list', () => {
    const events = [event('e1', FUTURE, {
      isOpen: true,
      attendees: [
        { person: avatar('p1', 'Bruno', 'Kaiser'), state: 'accepted' },
        { person: avatar('p2', 'Anna', 'Muster'), state: 'invited' },
      ],
    })];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.rows.map(r => r.key)).toEqual(['p1', 'p2']);
    expect(table.rows[0].responses['e1']).toBe('accepted');
    expect(table.rows[1].responses['e1']).toBe('pending');   // 'invited' has no invitation equivalent
    expect(table.columns[0].locked).toBe(false);
  });

  it('reads answers of a closed event from the invitations', () => {
    const events = [event('e1', FUTURE, { isOpen: false })];
    const invitations = [
      invitation('i1', 'e1', 'p1', { inviteeFirstName: 'Bruno', inviteeLastName: 'Kaiser', state: 'declined' }),
      invitation('i2', 'e1', 'p2', { state: 'accepted' }),
    ];
    const table = buildSeriesAttendanceTable(events, invitations, me);
    expect(table.rows[0].responses['e1']).toBe('declined');
    expect(table.rows[1].responses['e1']).toBe('accepted');
  });

  it('locks a closed occurrence the current user was not invited to', () => {
    const events = [event('e1', FUTURE, { isOpen: false }), event('e2', '20990102', { isOpen: false })];
    const table = buildSeriesAttendanceTable(events, [invitation('i1', 'e1', 'p1')], me);
    expect(table.columns.find(c => c.id === 'e1')?.locked).toBe(false);
    expect(table.columns.find(c => c.id === 'e2')?.locked).toBe(true);
  });

  it('merges open and closed occurrences of the same series into one row per person', () => {
    const events = [
      event('e1', '20990101', { isOpen: true, attendees: [{ person: avatar('p2', 'Anna', 'Muster'), state: 'accepted' }] }),
      event('e2', '20990108', { isOpen: false }),
    ];
    const table = buildSeriesAttendanceTable(events, [invitation('i1', 'e2', 'p2', { state: 'declined' })], me);
    const anna = table.rows.find(r => r.key === 'p2');
    expect(anna?.responses).toEqual({ e1: 'accepted', e2: 'declined' });
  });

  it('puts the current user first and keeps a row even without any answer', () => {
    const events = [event('e1', FUTURE, {
      isOpen: true, attendees: [{ person: avatar('p2', 'Anna', 'Auer'), state: 'accepted' }],
    })];
    const table = buildSeriesAttendanceTable(events, [], me);
    expect(table.rows.map(r => r.key)).toEqual(['p1', 'p2']);
    expect(table.rows[0].responses).toEqual({});
  });

  it('ignores an archived invitation and one pointing outside the shown columns', () => {
    const events = [event('e1', FUTURE, { isOpen: false })];
    const invitations = [
      invitation('i1', 'e1', 'p2', { isArchived: true }),
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
