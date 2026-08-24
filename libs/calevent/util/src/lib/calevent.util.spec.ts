import { CalEventModel } from '@okr/shared-models';
import * as coreUtils from '@okr/shared-util-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bestScheduleColumn, buildCalEventLink, canAttendCalevent, buildSchedulePollLink, convertCalEventToFullCalendar, formatScheduleCloseMessage, formatSchedulePollInviteMessage, getCalEventCssClass, getSeriesUpdateFields, isCalEvent, isFullDayEvent, isPastCalevent, isPersonalCalendarName, isPersonalCalevent, isSchedulePoll, nextInvitationState, planSeriesReconcile } from './calevent.util';

// Mock shared utility functions
vi.mock('@okr/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    getTodayStr: vi.fn(),
    getIsoDateTime: vi.fn(),
    isType: vi.fn(),
  };
});

describe('CalEvent Utils', () => {
  const mockGetTodayStr = vi.mocked(coreUtils.getTodayStr);
  const mockGetIsoDateTime = vi.mocked(coreUtils.getIsoDateTime);
  const mockIsType = vi.mocked(coreUtils.isType);

  const tenantId = 'tenant-1';
  let baseCalEvent: CalEventModel;

  const modelType: 'person' | 'org' = 'person';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTodayStr.mockReturnValue('20250903');

    baseCalEvent = new CalEventModel(tenantId);
    baseCalEvent.okey = 'event-1';
    baseCalEvent.name = 'Test Event';
    baseCalEvent.type = 'socialEvent';
    baseCalEvent.startDate = '20251010';
    baseCalEvent.startTime = '10:00';
    baseCalEvent.durationMinutes = 60;
  });

  describe('isPersonalCalevent', () => {
    it('returns true when the event belongs to no calendar', () => {
      baseCalEvent.calendars = [];
      expect(isPersonalCalevent(baseCalEvent)).toBe(true);
    });

    it('returns false when the event belongs to a calendar', () => {
      baseCalEvent.calendars = ['scs'];
      expect(isPersonalCalevent(baseCalEvent)).toBe(false);
    });

    it('treats a legacy doc without calendars as personal', () => {
      expect(isPersonalCalevent({ ...baseCalEvent, calendars: undefined } as unknown as CalEventModel)).toBe(true);
    });
  });

  describe('isPersonalCalendarName', () => {
    it('accepts the personal calendars', () => {
      expect(isPersonalCalendarName('personal')).toBe(true);
      expect(isPersonalCalendarName('my')).toBe(true);
    });

    it('rejects shared calendars', () => {
      expect(isPersonalCalendarName('all')).toBe(false);
      expect(isPersonalCalendarName('scs')).toBe(false);
      expect(isPersonalCalendarName('')).toBe(false);
    });
  });

  describe('isCalEvent', () => {
    it('should return true if isType returns true', () => {
      mockIsType.mockReturnValue(true);
      expect(isCalEvent(baseCalEvent, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith(baseCalEvent, expect.any(CalEventModel));
    });

    it('should return false if isType returns false', () => {
      mockIsType.mockReturnValue(false);
      expect(isCalEvent({}, tenantId)).toBe(false);
    });
  });

  describe('isFullDayEvent', () => {
    it('should return true for an event with no start time', () => {
      baseCalEvent.startTime = '';
      expect(isFullDayEvent(baseCalEvent)).toBe(true);
    });

    it('should return false for an event with a start time', () => {
      baseCalEvent.startTime = '09:00';
      expect(isFullDayEvent(baseCalEvent)).toBe(false);
    });
  });

  describe('convertCalEventToFullCalendar', () => {
    it('should convert a full-day event correctly', () => {
      baseCalEvent.startTime = '';
      baseCalEvent.startDate = '2025-01-01';
      const fcEvent = convertCalEventToFullCalendar(baseCalEvent);
      // Single-day all-day event: `end` is omitted (FullCalendar's all-day end is exclusive,
      // so end === start would render zero-length; no end defaults to a 1-day span).
      expect(fcEvent).toEqual({
        title: 'Test Event',
        start: '2025-01-01',
        allDay: true,
      });
    });

    it('should convert a timed event correctly', () => {
      mockGetIsoDateTime
        .mockReturnValueOnce('2025-10-10T10:00:00') // for start
        .mockReturnValueOnce('2025-10-10T11:00:00'); // for end

      const fcEvent = convertCalEventToFullCalendar(baseCalEvent);

      expect(mockGetIsoDateTime).toHaveBeenCalledWith('20251010', '10:00');
      expect(mockGetIsoDateTime).toHaveBeenCalledWith('20251010', '11:00');
      expect(fcEvent).toEqual({
        title: 'Test Event',
        start: '2025-10-10T10:00:00',
        end: '2025-10-10T11:00:00',
        allDay: false,
      });
    });
  });
});

describe('isSchedulePoll', () => {
  it('returns true when at least one event has state proposed', () => {
    const e1 = new CalEventModel('t1');
    const e2 = new CalEventModel('t1');
    e1.state = 'proposed';
    expect(isSchedulePoll([e1, e2])).toBe(true);
  });

  it('returns false when no events are proposed', () => {
    const e = new CalEventModel('t1');
    e.state = 'definitive';
    expect(isSchedulePoll([e])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isSchedulePoll([])).toBe(false);
  });
});

describe('getCalEventCssClass', () => {
  it('returns state-proposed for proposed', () => {
    expect(getCalEventCssClass('proposed')).toBe('state-proposed');
  });

  it('returns state-provisional for provisional', () => {
    expect(getCalEventCssClass('provisional')).toBe('state-provisional');
  });

  it('returns empty string for definitive', () => {
    expect(getCalEventCssClass('definitive')).toBe('');
  });

  it('returns state-cancelled for cancelled', () => {
    expect(getCalEventCssClass('cancelled')).toBe('state-cancelled');
  });
});

describe('formatScheduleCloseMessage', () => {
  it('formats message with event name and date', () => {
    const msg = formatScheduleCloseMessage('Vereins-Ausflug', ['20250622']);
    expect(msg).toContain('✅ Vereins-Ausflug');
    expect(msg).toContain('Termin:');
  });

  it('appends author message when provided', () => {
    const msg = formatScheduleCloseMessage('Ausflug', ['20250622'], 'Freue mich!');
    expect(msg).toContain('Freue mich!');
  });

  it('omits blank author message', () => {
    const msg = formatScheduleCloseMessage('Ausflug', ['20250622'], '  ');
    expect(msg.split('\n')).toHaveLength(2);
  });

  // multi-date close: every confirmed date is listed, one per line, chronologically
  it('lists every date on its own line and pluralises the label', () => {
    const msg = formatScheduleCloseMessage('Training', ['20250916', '20250912']);
    const lines = msg.split('\n');
    expect(lines[0]).toBe('✅ Training');
    expect(lines[1]).toContain('Termine:');
    expect(lines).toHaveLength(4);
  });

  it('sorts the dates chronologically regardless of pick order', () => {
    const msg = formatScheduleCloseMessage('Training', ['20250916', '20250912']);
    expect(msg.indexOf('12.09.2025')).toBeLessThan(msg.indexOf('16.09.2025'));
  });

  it('keeps the author message last when several dates are confirmed', () => {
    const msg = formatScheduleCloseMessage('Training', ['20250912', '20250916'], 'Bis dann!');
    expect(msg.split('\n').at(-1)).toBe('Bis dann!');
  });

  it('returns just the name when no date was confirmed', () => {
    expect(formatScheduleCloseMessage('Training', [])).toBe('✅ Training');
  });
});

describe('isPastCalevent', () => {
  const event = (startDate: string, endDate = ''): CalEventModel =>
    ({ ...new CalEventModel('t1'), startDate, endDate });

  it('is past when startDate is before today', () => {
    expect(isPastCalevent(event('20200101'))).toBe(true);
  });

  it('is not past for a future event', () => {
    expect(isPastCalevent(event('20990101'))).toBe(false);
  });

  it('uses endDate for multi-day events', () => {
    expect(isPastCalevent(event('20200101', '20990101'))).toBe(false);
  });

  it('is not past without a date', () => {
    expect(isPastCalevent(event(''))).toBe(false);
  });
});

describe('canAttendCalevent', () => {
  const event = (over: Partial<CalEventModel>): CalEventModel =>
    ({ ...new CalEventModel('t1'), startDate: '20990101', calendars: ['scs'], isOpen: false, ...over });

  it('is never possible on a past event', () => {
    expect(canAttendCalevent(event({ startDate: '20200101', isOpen: true }), true)).toBe(false);
  });

  it('is possible for everybody on an open future event', () => {
    expect(canAttendCalevent(event({ isOpen: true }), false)).toBe(true);
  });

  it('is possible on a closed event only with an invitation', () => {
    expect(canAttendCalevent(event({}), true)).toBe(true);
    expect(canAttendCalevent(event({}), false)).toBe(false);
  });

  it('is possible on a personal event without an invitation (the organiser has none)', () => {
    expect(canAttendCalevent(event({ calendars: [] }), false)).toBe(true);
  });
});

describe('series reconcile', () => {
  const occurrence = (okey: string, startDate: string): CalEventModel =>
    ({ ...new CalEventModel('t1'), okey, startDate, seriesId: 's1' });

  it('keeps the documents of an unchanged range', () => {
    const affected = [occurrence('s100', '20260601'), occurrence('s101', '20260608')];
    const plan = planSeriesReconcile(affected, ['20260601', '20260608']);
    expect(plan.updates.map(u => [u.event.okey, u.startDate])).toEqual([['s100', '20260601'], ['s101', '20260608']]);
    expect(plan.archives).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it('creates the occurrences a longer range adds', () => {
    const affected = [occurrence('s100', '20260601')];
    const plan = planSeriesReconcile(affected, ['20260601', '20260608', '20260615']);
    expect(plan.updates).toHaveLength(1);
    expect(plan.creates).toEqual(['20260608', '20260615']);
    expect(plan.archives).toEqual([]);
  });

  it('archives the occurrences a shorter range drops', () => {
    const affected = [occurrence('s100', '20260601'), occurrence('s101', '20260608'), occurrence('s102', '20260615')];
    const plan = planSeriesReconcile(affected, ['20260601']);
    expect(plan.updates).toHaveLength(1);
    expect(plan.archives.map(e => e.okey)).toEqual(['s101', 's102']);
    expect(plan.creates).toEqual([]);
  });

  it('shifts every occurrence when the series moves', () => {
    const affected = [occurrence('s100', '20260601'), occurrence('s101', '20260608')];
    const plan = planSeriesReconcile(affected, ['20260602', '20260609']);
    expect(plan.updates.map(u => u.startDate)).toEqual(['20260602', '20260609']);
  });

  it('propagates shared fields but never okey, attendees or isArchived', () => {
    const edited: CalEventModel = { ...new CalEventModel('t1'), okey: 's100', name: 'Training', startDate: '20260601',
      attendees: [{ person: { key: 'p1', name1: 'A', name2: 'B', modelType: 'person', type: '', subType: '', label: '' }, state: 'accepted' }] };
    const fields = getSeriesUpdateFields(edited, '20260608');
    expect(fields['name']).toBe('Training');
    expect(fields['startDate']).toBe('20260608');
    expect(fields['index']).toContain('20260608');   // index carries the target occurrence's date
    expect(fields).not.toHaveProperty('okey');
    expect(fields).not.toHaveProperty('attendees');
    expect(fields).not.toHaveProperty('isArchived');
    expect(fields).not.toHaveProperty('tenants');
  });
});

describe('nextInvitationState', () => {
  it('cycles pending -> accepted -> declined -> pending', () => {
    expect(nextInvitationState('pending')).toBe('accepted');
    expect(nextInvitationState('accepted')).toBe('declined');
    expect(nextInvitationState('declined')).toBe('pending');
  });
  it('treats maybe like pending', () => {
    expect(nextInvitationState('maybe')).toBe('accepted');
  });
});

describe('bestScheduleColumn', () => {
  it('returns the index of the highest count', () => {
    expect(bestScheduleColumn([2, 5, 3])).toBe(1);
  });
  it('returns the first index on a tie', () => {
    expect(bestScheduleColumn([4, 4, 1])).toBe(0);
  });
  it('returns -1 when nobody accepted', () => {
    expect(bestScheduleColumn([0, 0, 0])).toBe(-1);
  });
  it('returns -1 for an empty poll', () => {
    expect(bestScheduleColumn([])).toBe(-1);
  });
});

describe('buildSchedulePollLink', () => {
  it('builds the deep link into the group calendar', () => {
    expect(buildSchedulePollLink('https://scs.app', 'cal1', 'abc'))
      .toBe('https://scs.app/calevent/cal1/c-calevents?poll=abc');
  });
  it('drops a trailing slash on the origin', () => {
    expect(buildSchedulePollLink('https://scs.app/', 'cal1', 'abc'))
      .toBe('https://scs.app/calevent/cal1/c-calevents?poll=abc');
  });
});

describe('buildCalEventLink', () => {
  it('deep-links through the list route, not through a /calevent/<okey> detail route', () => {
    // An okey would bind as :listId and render an EMPTY list — the reason the alias target
    // is a url and not a model target.
    expect(buildCalEventLink('https://scs.app', 'abc'))
      .toBe('https://scs.app/calevent/all/c-calevents?event=abc');
  });
  it('drops a trailing slash on the origin', () => {
    expect(buildCalEventLink('https://scs.app/', 'abc'))
      .toBe('https://scs.app/calevent/all/c-calevents?event=abc');
  });
  it('uses `all`, so the recipient need not have the event\'s calendar selected', () => {
    expect(buildCalEventLink('https://scs.app', 'abc')).toContain('/calevent/all/');
  });
});

describe('formatSchedulePollInviteMessage', () => {
  it('names the poll and carries the link', () => {
    const msg = formatSchedulePollInviteMessage('SCS Achter', 'https://scs.app/x');
    expect(msg).toContain('SCS Achter');
    expect(msg).toContain('https://scs.app/x');
  });
});
