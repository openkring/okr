import { describe, expect, it } from 'vitest';
import type { TripModel } from '@okr/shared-models';

import { isExpiringTenant } from './expiring-tenants';
import { expiryDecision, recordingExpiry } from './tracker-expiry';

const CLUB = new Set(['scs']);
const rec = (extra: Partial<TripModel> = {}, track: Partial<NonNullable<TripModel['track']>> = {}): TripModel =>
  ({ type: 'tracker', tenants: ['scs'], startDate: '20261024', track: { startedAt: '2026-10-24T07:00:00Z', endedAt: '2026-10-24T09:00:00Z', ...track }, ...extra }) as TripModel;

describe('isExpiringTenant', () => {
  it('expires a club app with the Logbuch', () => expect(isExpiringTenant(new Set(['trip', 'calendar']))).toBe(true));
  it('never expires a diary or journal app', () => {
    expect(isExpiringTenant(new Set(['trip', 'diary']))).toBe(false);
    expect(isExpiringTenant(new Set(['trip', 'journal']))).toBe(false);
  });
  it('never expires an app without the Logbuch', () => expect(isExpiringTenant(new Set(['calendar']))).toBe(false));
});

describe('recordingExpiry', () => {
  it('is the end (Zurich) + 7 days', () => expect(recordingExpiry(rec())).toBe('20261031'));
  it('takes the Zurich date of a late-evening end', () => expect(recordingExpiry(rec({}, { endedAt: '2026-10-24T22:30:00Z' }))).toBe('20261101'));
  it('falls back to the start, then to startDate', () => {
    expect(recordingExpiry(rec({}, { endedAt: '' }))).toBe('20261031');
    expect(recordingExpiry(rec({}, { endedAt: '', startedAt: '' }))).toBe('20261031');
  });
  it('is empty without any date', () => expect(recordingExpiry(rec({ startDate: '' }, { endedAt: '', startedAt: '' }))).toBe(''));
});

describe('expiryDecision', () => {
  it('keeps a club recording up to and on its last day', () => expect(expiryDecision(rec(), CLUB, '20261031')).toBe('keep'));
  it('deletes it the day after', () => expect(expiryDecision(rec(), CLUB, '20261101')).toBe('delete'));
  it('keeps one a diary pulled', () => expect(expiryDecision(rec({ tenants: ['scs', 'bka'] }), CLUB, '20261201')).toBe('keep'));
  it('keeps one attached to a journal', () => expect(expiryDecision(rec({}, { journalKey: 'j1' }), CLUB, '20261201')).toBe('keep'));
  it('keeps recordings of a diary app and crew copies', () => {
    expect(expiryDecision(rec({ tenants: ['bka'] }), CLUB, '20261201')).toBe('keep');
  });
  it('keeps other trip types', () => expect(expiryDecision(rec({ type: 'logbuch' }), CLUB, '20261201')).toBe('keep'));
  it('hands a linked recording to the Logbuch check', () => expect(expiryDecision(rec({}, { logbuchKey: 'lb1' }), CLUB, '20261101')).toBe('logbuch'));
  it('keeps a recording without any date', () => {
    expect(expiryDecision(rec({ startDate: '' }, { endedAt: '', startedAt: '' }), CLUB, '20991231')).toBe('keep');
  });
});
