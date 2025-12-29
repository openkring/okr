import { CalEventModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertCalEventToFullCalendar, fullDayEventLength, isCalEvent, isFullDayEvent } from './calevent.util';

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
    baseCalEvent.endDate = '20251010';
    baseCalEvent.endTime = '11:00';
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

  describe('fullDayEventLength', () => {
    it('should return 0 for a non-full-day event', () => {
      baseCalEvent.startTime = '09:00';
      expect(fullDayEventLength(baseCalEvent)).toBe(0);
    });

    it('should return 1 for a single full-day event', () => {
      baseCalEvent.startTime = '';
      baseCalEvent.startDate = '20250101';
      baseCalEvent.endDate = '20250101';
      expect(fullDayEventLength(baseCalEvent)).toBe(1);
    });

    it('should return correct length for a multi-day event', () => {
      baseCalEvent.startTime = '';
      baseCalEvent.startDate = '20250101';
      baseCalEvent.endDate = '20250103';
      expect(fullDayEventLength(baseCalEvent)).toBe(3);
    });
  });

  describe('convertCalEventToFullCalendar', () => {
    it('should convert a full-day event correctly', () => {
      baseCalEvent.startTime = '';
      baseCalEvent.startDate = '2025-01-01';
      baseCalEvent.endDate = '2025-01-02';
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
