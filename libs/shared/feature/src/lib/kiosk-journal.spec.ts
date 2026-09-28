import { describe, expect, it } from 'vitest';
import {
  classifyKioskOutage,
  emptyKioskJournal,
  KIOSK_JOURNAL_MAX,
  KioskJournal,
  kioskMonitorSlug,
  markKioskReached,
  recordKioskEvent,
  tickKioskJournal,
} from './kiosk-journal';

const t = (hhmm: string) => `2026-09-27T${hhmm}:00.000Z`;

/** A journal whose last successful check-in was at `reached` and whose page last ticked at `alive`. */
const journal = (reached: string, alive = reached, events: KioskJournal['events'] = []): KioskJournal =>
  ({ lastReached: reached, lastAlive: alive, events });

describe('recordKioskEvent', () => {
  it('appends and keeps only the newest entries', () => {
    let j = emptyKioskJournal();
    for (let i = 0; i < KIOSK_JOURNAL_MAX + 5; i++) j = recordKioskEvent(j, 'visible', t('05:00'));
    j = recordKioskEvent(j, 'offline', t('06:00'));
    expect(j.events).toHaveLength(KIOSK_JOURNAL_MAX);
    expect(j.events.at(-1)).toEqual({ at: t('06:00'), kind: 'offline' });
  });
});

describe('tickKioskJournal', () => {
  it('records a silence when the page did not tick for longer than the silence threshold', () => {
    const j = tickKioskJournal(journal(t('05:00'), t('05:00')), t('06:00'));
    expect(j.lastAlive).toBe(t('06:00'));
    expect(j.events).toEqual([{ at: t('05:00'), kind: 'silence', ms: 60 * 60_000 }]);
  });

  it('does not record a silence for a regular 5-minute tick', () => {
    const j = tickKioskJournal(journal(t('05:00'), t('05:00')), t('05:05'));
    expect(j.events).toEqual([]);
  });

  it('does not record a silence on the very first tick', () => {
    expect(tickKioskJournal(emptyKioskJournal(), t('05:00')).events).toEqual([]);
  });
});

describe('markKioskReached', () => {
  it('reports nothing for a short gap', () => {
    const { journal: j, outage } = markKioskReached(journal(t('05:00'), t('05:10')), t('05:10'));
    expect(outage).toBeUndefined();
    expect(j.lastReached).toBe(t('05:10'));
  });

  it('reports nothing on the first check-in ever', () => {
    expect(markKioskReached(emptyKioskJournal(), t('05:00')).outage).toBeUndefined();
  });

  it('reports an outage with only the events inside the gap', () => {
    const before = { at: t('04:00'), kind: 'offline' as const };
    const inside = { at: t('05:30'), kind: 'offline' as const };
    const { outage } = markKioskReached(journal(t('05:00'), t('07:55'), [before, inside]), t('08:00'));
    expect(outage).toMatchObject({ from: t('05:00'), to: t('08:00'), minutes: 180, cause: 'offline' });
    expect(outage?.events).toEqual([inside]);
  });

  it('keeps a silence that started at the tick just before the last successful check-in', () => {
    // tick at 05:00:00.000, its check-in accepted 300 ms later — the silence starts before lastReached
    let j = tickKioskJournal(emptyKioskJournal(), '2026-09-27T05:00:00.000Z');
    j = markKioskReached(j, '2026-09-27T05:00:00.300Z').journal;
    j = recordKioskEvent(j, 'boot', t('08:00'));
    j = tickKioskJournal(j, t('08:00'));
    const { outage } = markKioskReached(j, '2026-09-27T08:00:00.300Z');
    expect(outage?.cause).toBe('webview-reloaded');
  });
});

describe('classifyKioskOutage', () => {
  const from = t('05:00');
  const to = t('08:00');
  const silence = { at: t('05:00'), kind: 'silence' as const, ms: 3 * 60 * 60_000 };

  it('asleep: the page went hidden and stopped running', () => {
    expect(classifyKioskOutage([{ at: t('05:02'), kind: 'hidden' }, silence], from, to)).toBe('asleep');
  });

  it('webview-reloaded: the page stopped while visible and came back as a fresh boot', () => {
    expect(classifyKioskOutage([{ at: t('08:00'), kind: 'boot' }, silence], from, to)).toBe('webview-reloaded');
  });

  it('suspended: the page stopped while visible and resumed without a reload', () => {
    expect(classifyKioskOutage([silence], from, to)).toBe('suspended');
  });

  it('offline: the page kept running but the device reported no network', () => {
    expect(classifyKioskOutage([{ at: t('05:03'), kind: 'offline' }], from, to)).toBe('offline');
  });

  it('unreachable: the page kept running, the device claimed a network, check-ins still failed', () => {
    expect(classifyKioskOutage([], from, to)).toBe('unreachable');
  });

  it('a short silence inside a long network outage stays a network outage', () => {
    const short = { at: t('06:00'), kind: 'silence' as const, ms: 15 * 60_000 };
    expect(classifyKioskOutage([{ at: t('05:03'), kind: 'offline' }, short], from, to)).toBe('offline');
  });
});

describe('kioskMonitorSlug', () => {
  it('is lower-case, tenant-scoped and stable per kiosk user', () => {
    expect(kioskMonitorSlug('scs', 'GJ8f6WX7oETDnEgTixKjAzYOPii1')).toBe('logbuch-kiosk-scs-gj8f6wx7');
  });
});
