import { CalEventModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertCalEventToFullCalendar, formatScheduleCloseMessage, getCalEventCssClass, isCalEvent, isFullDayEvent, isSchedulePoll } from './calevent.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
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
    baseCalEvent.bkey = 'event-1';
    baseCalEvent.name = 'Test Event';
    baseCalEvent.type = 'socialEvent';
    baseCalEvent.startDate = '20251010';
    baseCalEvent.startTime = '10:00';
    baseCalEvent.durationMinutes = 60;
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
      expect(fcEvent).toEqual({
        title: 'Test Event',
        start: '2025-01-01',
        end: '2025-01-02',
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
});

describe('formatScheduleCloseMessage', () => {
  it('formats message with event name and date', () => {
    const msg = formatScheduleCloseMessage('Vereins-Ausflug', '20250622');
    expect(msg).toContain('✅ Vereins-Ausflug');
    expect(msg).toContain('Termin:');
  });

  it('appends author message when provided', () => {
    const msg = formatScheduleCloseMessage('Ausflug', '20250622', 'Freue mich!');
    expect(msg).toContain('Freue mich!');
  });

  it('omits blank author message', () => {
    const msg = formatScheduleCloseMessage('Ausflug', '20250622', '  ');
    expect(msg.split('\n')).toHaveLength(2);
  });
});
