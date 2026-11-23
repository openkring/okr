import { describe, expect, it } from 'vitest';

import { StartPage } from '@okr/shared-models';

import {
  featureOffUrl, isDepartureEmergencyAvailable, isOnDepartureTrip, isStartPageAvailable, resolveStartUrl, resolveUserStartUrl, safeRootUrl,
  shouldJumpToEmergency, START_PAGE_URLS, UNKNOWN_PAGE_URL, WELCOME_URL,
} from './start-page.util';

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

describe('safeRootUrl', () => {
  it('opens the welcome page without a usable url', () => {
    for (const url of [undefined, null, '', ' ', '/', ' / ', '//', '/?filters=search', '/#top']) expect(safeRootUrl(url)).toBe(WELCOME_URL);
  });
  it('opens the welcome page for a foreign or relative url', () => {
    for (const url of ['https://example.com/x', '//example.com/x', '/\\example.com', 'private/dashboard', 'javascript:alert(1)']) {
      expect(safeRootUrl(url)).toBe(WELCOME_URL);
    }
  });
  it('keeps a good url, with its query', () => {
    expect(safeRootUrl('/private/dashboard/c-contentpage')).toBe('/private/dashboard/c-contentpage');
    expect(safeRootUrl(' /person/all/c-persons?filters=search ', '/')).toBe('/person/all/c-persons?filters=search');
    expect(safeRootUrl('/diary/all/c-diary', '/diary/all')).toBe('/diary/all/c-diary');
  });
  it('opens the welcome page when the url is the current page, whatever query, fragment or slash it carries', () => {
    for (const current of ['/a/b', '/a/b/', '/a/b?x=1', '/a/b#top']) {
      expect(safeRootUrl('/a/b', current)).toBe(WELCOME_URL);
      expect(safeRootUrl('/a/b/?y=2', current)).toBe(WELCOME_URL);
    }
    expect(safeRootUrl('/a/ü', '/a/%C3%BC')).toBe(WELCOME_URL);
    expect(safeRootUrl('/a/%', '/a/%')).toBe(WELCOME_URL);
  });
});

describe('featureOffUrl', () => {
  it('opens the root url, or the welcome page instead of the current page', () => {
    expect(featureOffUrl('/a/b?x=1', '/quiz')).toBe('/a/b?x=1');
    expect(featureOffUrl('/a/b', '/a/b?x=1')).toBe(WELCOME_URL);
    expect(featureOffUrl(undefined, undefined)).toBe(WELCOME_URL);
  });
  it('leaves the welcome page for a page no block gates', () => {
    expect(featureOffUrl('/a/b', '/public/welcome?x=1')).toBe(UNKNOWN_PAGE_URL);
    expect(featureOffUrl('/public/welcome', '/public/welcome/')).toBe(UNKNOWN_PAGE_URL);
  });
  it('ends from every start when every block is off', () => {
    for (const root of ['/a/b?x=1', '/', '/public/welcome', '/public/welcome/c-contentpage']) {
      let url = '/quiz';
      for (let hop = 0; hop < 4 && url !== UNKNOWN_PAGE_URL; hop++) url = featureOffUrl(root, url);
      expect(url).toBe(UNKNOWN_PAGE_URL);
    }
  });
});
