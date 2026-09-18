import { describe, expect, it } from 'vitest';

import {
  findMissingModernApis,
  getDeviceSupportTags,
  IOS_BUILD_FLOOR,
  isBelowBuildFloor,
  parseIosVersion,
  parseOsVersion,
} from './device-support';

/** Real user-agent shapes, not invented ones — the parsing is only worth as much as these are. */
const UA = {
  iphone18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
  iphone17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  iphone15: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ masquerading as a desktop Mac — carries no iOS version at all.
  ipadDesktopUa: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  crios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('parseIosVersion', () => {
  it('reads major and minor from an iPhone UA', () => {
    expect(parseIosVersion(UA.iphone18)).toBe(18.7);
    expect(parseIosVersion(UA.iphone17)).toBe(17.6);
  });

  it('reads the shorter "CPU OS" form an iPad uses', () => {
    expect(parseIosVersion(UA.ipadOld)).toBe(15.8);
  });

  it('reads the version for a non-Safari iOS browser — Apple mandates WebKit for all of them', () => {
    expect(parseIosVersion(UA.crios)).toBe(17.5);
  });

  it('gives up on iPadOS masquerading as desktop Mac — the OS hides the version on purpose', () => {
    expect(parseIosVersion(UA.ipadDesktopUa)).toBeUndefined();
  });

  it('gives up on non-Apple and desktop UAs rather than guessing', () => {
    expect(parseIosVersion(UA.android)).toBeUndefined();
    expect(parseIosVersion(UA.macDesktop)).toBeUndefined();
    expect(parseIosVersion('')).toBeUndefined();
  });
});

describe('parseOsVersion', () => {
  it('reports iOS and Android, whose UAs still carry a real version', () => {
    expect(parseOsVersion(UA.iphone18)).toBe('18.7');
    expect(parseOsVersion(UA.android)).toBe('14');
  });

  it('reports nothing for desktop, whose version is frozen and would be noise', () => {
    expect(parseOsVersion(UA.macDesktop)).toBeUndefined();
  });
});

describe('isBelowBuildFloor', () => {
  it('flags an iOS version under the floor', () => {
    expect(isBelowBuildFloor(UA.iphone17, [])).toBe('true');
    expect(isBelowBuildFloor(UA.iphone15, [])).toBe('true');
  });

  it('clears an iOS version at or above the floor', () => {
    expect(isBelowBuildFloor(UA.iphone18, [])).toBe('false');
  });

  it('lets a failed probe outrank the UA — that is what sees through a masquerading iPad', () => {
    expect(isBelowBuildFloor(UA.ipadDesktopUa, ['Promise.withResolvers@ios17.4'])).toBe('true');
    // Even a UA that looks fine loses to hard evidence that an API is missing.
    expect(isBelowBuildFloor(UA.iphone18, ['Object.groupBy@ios17.4'])).toBe('true');
  });

  it('says unknown, never false, when there is no version to judge', () => {
    expect(isBelowBuildFloor(UA.ipadDesktopUa, [])).toBe('unknown');
    expect(isBelowBuildFloor(UA.macDesktop, [])).toBe('unknown');
  });

  it('treats the floor itself as supported', () => {
    const atFloor = UA.iphone18.replace('18_7', String(IOS_BUILD_FLOOR).replace('.', '_'));
    expect(isBelowBuildFloor(atFloor, [])).toBe('false');
  });
});

describe('findMissingModernApis', () => {
  it('finds nothing missing on the test runner, which is well above the floor', () => {
    expect(findMissingModernApis()).toEqual([]);
  });
});

describe('getDeviceSupportTags', () => {
  it('tags an old iPhone as below the floor, with a version you can aggregate on', () => {
    expect(getDeviceSupportTags(UA.iphone15)).toEqual({
      osVersion: '15.8',
      iosVersion: '15.8',
      belowBuildFloor: 'true',
      missingModernApis: 'none',
    });
  });

  it('tags a current iPhone as supported', () => {
    expect(getDeviceSupportTags(UA.iphone18)).toMatchObject({
      osVersion: '18.7', iosVersion: '18.7', belowBuildFloor: 'false',
    });
  });

  it('omits iosVersion entirely off iOS, so an alert rule needs no platform clause', () => {
    const tags = getDeviceSupportTags(UA.android);
    expect(tags.iosVersion).toBeUndefined();
    expect(tags.osVersion).toBe('14');
  });

  it('reports unknown rather than an empty string when the UA carries no version', () => {
    expect(getDeviceSupportTags(UA.macDesktop).osVersion).toBe('unknown');
  });

  it('never throws without a navigator (SSR)', () => {
    expect(() => getDeviceSupportTags('')).not.toThrow();
  });
});
