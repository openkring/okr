import { describe, expect, it } from 'vitest';

import { CalEventModel } from '@okr/shared-models';

import {
  auditCalEventSeries,
  findConflictingCalEvents,
  findDuplicateCalEvents,
  getCalEventSlotKey,
  previewSeries,
} from './calevent-audit.util';

const TENANT = 'scs';

/** Builds an event with the fields these helpers actually read. */
function makeEvent(overrides: Partial<CalEventModel> = {}): CalEventModel {
  const event = new CalEventModel(TENANT);
  event.okey = 'k1';
  event.name = '4X-Dienstag';
  event.startDate = '20260616';
  event.startTime = '06:45';
  event.index = `d:${overrides.startDate ?? '20260616'} n:4X-Dienstag`;
  return Object.assign(event, overrides);
}

describe('calevent-audit.util', () => {

  describe('getCalEventSlotKey', () => {
    it('treats "4X Dienstag" and "4X-Dienstag" as the same slot', () => {
      const a = makeEvent({ name: '4X Dienstag' });
      const b = makeEvent({ name: '4X-Dienstag' });
      expect(getCalEventSlotKey(a)).toBe(getCalEventSlotKey(b));
    });

    it('separates slots by date and time', () => {
      expect(getCalEventSlotKey(makeEvent({ startDate: '20260616' })))
        .not.toBe(getCalEventSlotKey(makeEvent({ startDate: '20260623' })));
      expect(getCalEventSlotKey(makeEvent({ startTime: '06:45' })))
        .not.toBe(getCalEventSlotKey(makeEvent({ startTime: '07:30' })));
    });
  });

  describe('findDuplicateCalEvents', () => {
    it('reports two live events on the same slot, ordered by okey', () => {
      const a = makeEvent({ okey: 'bbb', seriesId: 's2', calendars: ['scs'] });
      const b = makeEvent({ okey: 'aaa', seriesId: 's1', calendars: ['Dienstags 4-er'] });
      const result = findDuplicateCalEvents([a, b]);

      expect(result).toHaveLength(1);
      expect(result[0].events.map(e => e.okey)).toEqual(['aaa', 'bbb']);
      expect(result[0].seriesIds).toEqual(['s1', 's2']);
      expect(result[0].calendars).toEqual(['Dienstags 4-er', 'scs']);
    });

    it('returns nothing when the slot is occupied once', () => {
      expect(findDuplicateCalEvents([makeEvent({ okey: 'a' }), makeEvent({ okey: 'b', startDate: '20260623' })])).toEqual([]);
    });

    it('ignores archived events — the debris left by a "delete and recreate"', () => {
      const live = makeEvent({ okey: 'live' });
      const dead = makeEvent({ okey: 'dead', isArchived: true });
      expect(findDuplicateCalEvents([live, dead])).toEqual([]);
    });

    it('ignores schedule-poll columns, which share a name by construction', () => {
      const a = makeEvent({ okey: 'a', state: 'proposed' });
      const b = makeEvent({ okey: 'b', state: 'proposed' });
      const c = makeEvent({ okey: 'c', columnLabel: 'Text' });
      const d = makeEvent({ okey: 'd', columnLabel: 'Text' });
      expect(findDuplicateCalEvents([a, b, c, d])).toEqual([]);
    });

    it('orders findings by date', () => {
      const events = [
        makeEvent({ okey: 'b1', startDate: '20260908' }), makeEvent({ okey: 'b2', startDate: '20260908' }),
        makeEvent({ okey: 'a1', startDate: '20260616' }), makeEvent({ okey: 'a2', startDate: '20260616' }),
      ];
      expect(findDuplicateCalEvents(events).map(d => d.startDate)).toEqual(['20260616', '20260908']);
    });
  });

  describe('findConflictingCalEvents', () => {
    it('finds the event already sitting on the candidate slot', () => {
      const existing = makeEvent({ okey: 'existing' });
      const candidate = makeEvent({ okey: '' });
      expect(findConflictingCalEvents(candidate, [existing]).map(e => e.okey)).toEqual(['existing']);
    });

    it('never reports the candidate against itself', () => {
      const self = makeEvent({ okey: 'same' });
      expect(findConflictingCalEvents(self, [self])).toEqual([]);
    });

    it('reports a free slot as free', () => {
      const existing = makeEvent({ okey: 'existing', startDate: '20260623' });
      expect(findConflictingCalEvents(makeEvent({ okey: '' }), [existing])).toEqual([]);
    });
  });

  describe('auditCalEventSeries', () => {
    /** 13 weekly occurrences whose rule claims to run until 2028 — the kgmr0oy175egywbn43 case. */
    function makeShortSeries(): CalEventModel[] {
      const dates = ['20260616', '20260623', '20260630', '20260707', '20260714', '20260721', '20260728',
        '20260804', '20260811', '20260818', '20260825', '20260901', '20260908'];
      return dates.map((startDate, i) => makeEvent({
        okey: `kgmr${i}`, startDate, seriesId: 'kgmr', periodicity: 'weekly', repeatUntilDate: '20281230',
        index: `d:${startDate} n:4X-Dienstag`,
      }));
    }

    it('flags a series holding fewer occurrences than its rule describes', () => {
      const issues = auditCalEventSeries(makeShortSeries()).filter(i => i.kind === 'countMismatch');
      expect(issues).toHaveLength(1);
      expect(issues[0].actual).toBe(13);
      expect(issues[0].expected).toBeGreaterThan(100); // over the ceiling: the rule is unusable
      expect(issues[0].firstDate).toBe('20260616');
      expect(issues[0].lastDate).toBe('20260908');
    });

    it('accepts a series that matches its rule', () => {
      const dates = ['20260616', '20260623', '20260630'];
      const series = dates.map((startDate, i) => makeEvent({
        okey: `ok${i}`, startDate, seriesId: 'ok', periodicity: 'weekly', repeatUntilDate: '20260630',
        index: `d:${startDate} n:4X-Dienstag`,
      }));
      expect(auditCalEventSeries(series)).toEqual([]);
    });

    it('flags occurrences whose index carries the wrong date — the whole-model-spread fingerprint', () => {
      const series = ['20260620', '20260627'].map((startDate, i) => makeEvent({
        okey: `rxiu${i}`, startDate, seriesId: 'rxiu', periodicity: 'weekly', repeatUntilDate: '20260627',
        index: 'd:20260620 n:4X-Dienstag', // every sibling carries the FIRST date
      }));
      const issues = auditCalEventSeries(series).filter(i => i.kind === 'staleIndex');
      expect(issues).toHaveLength(1);
      expect(issues[0].okeys).toEqual(['rxiu1']);
    });

    it('exempts a poll-born series, whose dates no periodicity describes', () => {
      const series = ['20260616', '20260702'].map((startDate, i) => makeEvent({
        okey: `poll${i}`, startDate, seriesId: 'poll', pollMultiSelect: true,
        periodicity: 'weekly', repeatUntilDate: '20261230', index: `d:${startDate} n:4X-Dienstag`,
      }));
      expect(auditCalEventSeries(series).filter(i => i.kind === 'countMismatch')).toEqual([]);
    });

    it('ignores single events, which have no seriesId', () => {
      expect(auditCalEventSeries([makeEvent({ okey: 'single', seriesId: '' })])).toEqual([]);
    });
  });

  describe('previewSeries', () => {
    it('describes the series the store would create', () => {
      const preview = previewSeries('20260616', '20261230', 'weekly');
      expect(preview.count).toBe(29);
      expect(preview.firstDate).toBe('20260616');
      expect(preview.lastDate).toBe('20261229');
      expect(preview.isEmpty).toBe(false);
      expect(preview.exceedsMax).toBe(false);
    });

    it('reports an empty range instead of silently creating nothing', () => {
      const preview = previewSeries('20261230', '20260616', 'weekly');
      expect(preview.isEmpty).toBe(true);
      expect(preview.count).toBe(0);
    });

    it('reports a range over the ceiling — the 2028 repeat-until case', () => {
      expect(previewSeries('20260616', '20281230', 'weekly').exceedsMax).toBe(true);
    });
  });
});
