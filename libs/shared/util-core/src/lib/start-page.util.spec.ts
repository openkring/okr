import { describe, expect, it } from 'vitest';

import { StartPage } from '@okr/shared-models';

import { isDepartureEmergencyAvailable, isOnDepartureTrip, isStartPageAvailable, resolveStartUrl, resolveUserStartUrl, shouldJumpToEmergency, START_PAGE_URLS } from './start-page.util';

describe('resolveStartUrl', () => {
  const root = '/private/dashboard/c-contentpage';

  it('falls back to rootUrl for Default, undefined, null and unknown values', () => {
    expect(resolveStartUrl(StartPage.Default, root)).toBe(root);
    expect(resolveStartUrl(undefined, root)).toBe(root);
    expect(resolveStartUrl(null, root)).toBe(root);
    expect(resolveStartUrl(99 as StartPage, root)).toBe(root);
  });

  it('returns the page URL for a chosen start page', () => {
    expect(resolveStartUrl(StartPage.Emergency, root)).toBe('/private/notfall_content/c-contentpage');
    expect(resolveStartUrl(StartPage.Logbuch, root)).toBe('/trips/logbuch/c-trips');
  });

  it('has a URL for every page except Default', () => {
    for (const page of Object.values(StartPage).filter((v): v is StartPage => typeof v === 'number')) {
      expect(START_PAGE_URLS[page] === '').toBe(page === StartPage.Default);
    }
  });
});

describe('isStartPageAvailable', () => {
  const all = { isEnabled: () => true, hasEmergencyGroup: true };

  it('always offers Default', () => {
    expect(isStartPageAvailable(StartPage.Default, { isEnabled: () => false, hasEmergencyGroup: false })).toBe(true);
  });

  it('hides a page whose block is off', () => {
    const noTrip = { isEnabled: (b: string) => b !== 'trip', hasEmergencyGroup: true };
    expect(isStartPageAvailable(StartPage.Logbuch, noTrip)).toBe(false);
    expect(isStartPageAvailable(StartPage.MyTasks, noTrip)).toBe(true);
  });

  it('hides Emergency without the emergency group, even with chat on', () => {
    expect(isStartPageAvailable(StartPage.Emergency, { ...all, hasEmergencyGroup: false })).toBe(false);
    expect(isStartPageAvailable(StartPage.Emergency, all)).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isStartPageAvailable(99 as StartPage, all)).toBe(false);
  });
});

describe('resolveUserStartUrl (spec 1.158)', () => {
  const root = '/root';
  const emergency = START_PAGE_URLS[StartPage.Emergency];

  it('opens the Notfall page while an opted-in user is on an open trip', () => {
    expect(resolveUserStartUrl({ startPage: StartPage.MyTasks, emergencyOnDeparture: true, activeTripKey: 't1' }, root)).toBe(emergency);
  });

  it('uses the own start page without the opt-in or without an open trip', () => {
    expect(resolveUserStartUrl({ startPage: StartPage.MyTasks, emergencyOnDeparture: false, activeTripKey: 't1' }, root)).toBe('/task/my/c-tasks');
    expect(resolveUserStartUrl({ startPage: StartPage.MyTasks, emergencyOnDeparture: true, activeTripKey: '' }, root)).toBe('/task/my/c-tasks');
  });

  it('falls back to rootUrl for a missing user or legacy doc', () => {
    expect(resolveUserStartUrl(undefined, root)).toBe(root);
    expect(resolveUserStartUrl({}, root)).toBe(root);
    expect(isOnDepartureTrip(null)).toBe(false);
  });
});

describe('isDepartureEmergencyAvailable', () => {
  it('needs the Logbuch block and the Notfall page', () => {
    expect(isDepartureEmergencyAvailable({ isEnabled: () => true, hasEmergencyGroup: true })).toBe(true);
    expect(isDepartureEmergencyAvailable({ isEnabled: () => true, hasEmergencyGroup: false })).toBe(false);
    expect(isDepartureEmergencyAvailable({ isEnabled: (b) => b !== 'trip', hasEmergencyGroup: true })).toBe(false);
    expect(isDepartureEmergencyAvailable({ isEnabled: (b) => b !== 'chat', hasEmergencyGroup: true })).toBe(false);
  });
});

describe('shouldJumpToEmergency (spec 1.158 §2.3)', () => {
  const user = (activeTripKey: string, emergencyOnDeparture = true) => ({ okey: 'u1', activeTripKey, emergencyOnDeparture });

  it('jumps when an open trip appears for the same opted-in user', () => {
    expect(shouldJumpToEmergency({ uid: 'u1', activeTripKey: '' }, user('t1'))).toBe(true);
  });

  it('does not jump on the first emission, for another user, without opt-in, or when the trip ends', () => {
    expect(shouldJumpToEmergency(undefined, user('t1'))).toBe(false);
    expect(shouldJumpToEmergency({ uid: 'u2', activeTripKey: '' }, user('t1'))).toBe(false);
    expect(shouldJumpToEmergency({ uid: 'u1', activeTripKey: '' }, user('t1', false))).toBe(false);
    expect(shouldJumpToEmergency({ uid: 'u1', activeTripKey: 't1' }, user(''))).toBe(false);
    expect(shouldJumpToEmergency({ uid: 'u1', activeTripKey: 't1' }, user('t2'))).toBe(false);
    expect(shouldJumpToEmergency({ uid: 'u1', activeTripKey: '' }, null)).toBe(false);
  });
});
