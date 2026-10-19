import { describe, expect, it } from 'vitest';

import { CalEventModel } from '@okr/shared-models';
import { prettyFormatDate } from '@okr/shared-util-core';

import { duplicateEventFindings, DuplicateEventTexts } from './calevent-report.util';

const TEXTS: DuplicateEventTexts = {
  slot: '{count} Termine, Kalender: {calendars}, Serien: {series}',
  single: '(Einzeltermin)',
  countMismatch: 'Regel: {expected}, gespeichert: {actual}',
  staleIndex: '{count} fremde Daten: {okeys}',
};

function makeEvent(overrides: Partial<CalEventModel> = {}): CalEventModel {
  const event = new CalEventModel('scs');
  event.okey = 'k1';
  event.name = '4X-Dienstag';
  event.startDate = '20260616';
  event.startTime = '06:45';
  event.index = `d:${overrides.startDate ?? '20260616'} n:4X-Dienstag`;
  return Object.assign(event, overrides);
}

describe('duplicateEventFindings', () => {
  it('returns [] for no events', () => {
    expect(duplicateEventFindings([], TEXTS)).toEqual([]);
  });

  it('reports two events on one slot as one finding, without a url (events have no detail route)', () => {
    const events = [
      makeEvent({ okey: 'bbb', calendars: ['scs'] }),
      makeEvent({ okey: 'aaa', calendars: ['scs'] }),
      makeEvent({ okey: 'ccc', name: 'Anderer Termin' }),
    ];
    const findings = duplicateEventFindings(events, TEXTS);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('aaa/bbb');
    expect(findings[0].title).toContain('4X-Dienstag');
    expect(findings[0].title).toContain(prettyFormatDate('20260616'));
    expect(findings[0].title).toContain('06:45');
    expect(findings[0].detail).toBe('2 Termine, Kalender: scs, Serien: (Einzeltermin)');
    expect(findings[0].url).toBeUndefined();
  });

  it('reports a series whose count does not match its rule, keyed by the seriesId', () => {
    // weekly 16.06. to 07.07. describes 4 occurrences, only 3 are stored
    const series = ['20260616', '20260623', '20260630'].map((startDate, i) => makeEvent({
      okey: `kgmr${i}`, startDate, seriesId: 'kgmr', periodicity: 'weekly', repeatUntilDate: '20260707',
    }));
    const findings = duplicateEventFindings(series, TEXTS);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('kgmr');
    expect(findings[0].detail).toBe('Regel: 4, gespeichert: 3');
    expect(findings[0].url).toBeUndefined();
  });

  it('reports occurrences carrying a foreign date in the index', () => {
    const series = ['20260620', '20260627'].map((startDate, i) => makeEvent({
      okey: `rxiu${i}`, startDate, seriesId: 'rxiu', periodicity: 'weekly', repeatUntilDate: '20260627',
      index: 'd:20260620 n:4X-Dienstag',
    }));
    const findings = duplicateEventFindings(series, TEXTS);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('rxiu');
    expect(findings[0].detail).toBe('1 fremde Daten: rxiu1');
  });
});
