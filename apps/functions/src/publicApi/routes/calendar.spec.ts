import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => undefined }));

import { docToApiEvent, parseCalendarKeys, selectPublicEvents, type CalEventDoc } from './calendar';

function ev(okey: string, over: Partial<CalEventDoc> = {}): CalEventDoc {
  return {
    okey, name: okey, description: '', startDate: '20261205', startTime: '10:00', type: 'other',
    url: '', isArchived: false, calendars: ['public'], tenants: ['la21staefa'], ...over,
  };
}

const base = { tenantId: 'la21staefa', from: '20261201', to: '', calendarKeys: [] as string[] };

describe('selectPublicEvents', () => {
  it('keeps only the tenant\'s events', () => {
    const docs = [ev('a'), ev('b', { tenants: ['scs'] })];
    expect(selectPublicEvents(docs, base).map(d => d.okey)).toEqual(['a']);
  });

  it('applies the from and to bounds', () => {
    const docs = [ev('old', { startDate: '20261130' }), ev('in', { startDate: '20261210' }), ev('late', { startDate: '20270101' })];
    expect(selectPublicEvents(docs, { ...base, to: '20261231' }).map(d => d.okey)).toEqual(['in']);
  });

  it('sorts by date, then by time', () => {
    const docs = [ev('b', { startDate: '20261206', startTime: '09:00' }), ev('c', { startTime: '14:00' }), ev('a', { startTime: '08:00' })];
    expect(selectPublicEvents(docs, base).map(d => d.okey)).toEqual(['a', 'c', 'b']);
  });

  it('keeps an event that is in one of the requested calendars', () => {
    const docs = [ev('both', { calendars: ['public', 'reparatur', 'kiss'] }), ev('other', { calendars: ['public', 'kiss'] })];
    expect(selectPublicEvents(docs, { ...base, calendarKeys: ['reparatur'] }).map(d => d.okey)).toEqual(['both']);
  });

  it('lists an event that is in two requested calendars only once', () => {
    const docs = [ev('both', { calendars: ['public', 'reparatur', 'kiss'] })];
    expect(selectPublicEvents(docs, { ...base, calendarKeys: ['reparatur', 'kiss'] })).toHaveLength(1);
  });

  it('keeps every public event when no calendar is requested', () => {
    const docs = [ev('a', { calendars: ['public', 'kiss'] }), ev('b')];
    expect(selectPublicEvents(docs, base)).toHaveLength(2);
  });

  it('filters by category', () => {
    const docs = [ev('a', { type: 'other' }), ev('b', { type: 'regatta' })];
    expect(selectPublicEvents(docs, { ...base, category: 'regatta' }).map(d => d.okey)).toEqual(['b']);
  });

  it('tolerates a legacy event without startTime', () => {
    const docs = [ev('a', { startTime: undefined as unknown as string }), ev('b')];
    expect(selectPublicEvents(docs, base)).toHaveLength(2);
  });
});

describe('parseCalendarKeys', () => {
  it('splits, trims and drops empties', () => {
    expect(parseCalendarKeys(' reparatur, ,kiss ')).toEqual(['reparatur', 'kiss']);
  });

  it('returns [] for a missing parameter', () => {
    expect(parseCalendarKeys(undefined)).toEqual([]);
  });

  it('caps the list at 20 keys', () => {
    const many = Array.from({ length: 30 }, (_, i) => `k${i}`).join(',');
    expect(parseCalendarKeys(many)).toHaveLength(20);
  });

  it('ignores a non-string parameter (repeated query key)', () => {
    expect(parseCalendarKeys(['a', 'b'] as unknown as string)).toEqual([]);
  });
});

describe('docToApiEvent', () => {
  it('returns the event\'s calendars without public', () => {
    expect(docToApiEvent(ev('a', { calendars: ['public', 'reparatur'] })).calendars).toEqual(['reparatur']);
  });

  it('marks a cancelled event and carries its message', () => {
    const api = docToApiEvent(ev('a', { state: 'cancelled', cancelMessage: 'Fällt wegen Regen aus.' }));
    expect(api.cancelled).toBe(true);
    expect(api.cancelMessage).toEqual({ de: 'Fällt wegen Regen aus.' });
  });

  it('leaves the cancel fields out of a normal event', () => {
    const api = docToApiEvent(ev('a', { state: 'definitive' }));
    expect(api.cancelled).toBeUndefined();
    expect(api.cancelMessage).toBeUndefined();
  });

  it('marks a cancelled event without a message', () => {
    const api = docToApiEvent(ev('a', { state: 'cancelled', cancelMessage: '' }));
    expect(api.cancelled).toBe(true);
    expect(api.cancelMessage).toBeUndefined();
  });
});
