import { describe, expect, it } from 'vitest';

import {
  getInstallGuideSection, getInstallHint, InstallHintInput, installGuideUrl, isInAppBrowser, isIOSUserAgent, isMacUserAgent,
} from './install-guide.util';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/134.0.6998.99 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 16; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 16; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.0.0 Mobile Safari/537.36',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 360.0.0.0',
  googleAppIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/360.0.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
};

describe('isIOSUserAgent / isMacUserAgent', () => {
  it('counts an iPad in desktop mode as iOS, not as a Mac', () => {
    expect(isIOSUserAgent(UA.ipadDesktopMode, 5)).toBe(true);
    expect(isMacUserAgent(UA.ipadDesktopMode, 5)).toBe(false);
  });
  it('counts the same user agent without touch points as a Mac', () => {
    expect(isIOSUserAgent(UA.macSafari, 0)).toBe(false);
    expect(isMacUserAgent(UA.macSafari, 0)).toBe(true);
  });
  it('recognises an iPhone', () => {
    expect(isIOSUserAgent(UA.iphoneSafari)).toBe(true);
  });
});

describe('isInAppBrowser', () => {
  it('recognises in-app browsers and the Android WebView', () => {
    expect(isInAppBrowser(UA.instagramIos)).toBe(true);
    expect(isInAppBrowser(UA.googleAppIos)).toBe(true);
    expect(isInAppBrowser(UA.androidWebView)).toBe(true);
  });
  it('does not flag the normal browsers', () => {
    expect(isInAppBrowser(UA.iphoneSafari)).toBe(false);
    expect(isInAppBrowser(UA.androidChrome)).toBe(false);
    expect(isInAppBrowser(UA.macChrome)).toBe(false);
  });
});

describe('getInstallGuideSection', () => {
  const cases: [keyof typeof UA, number, string][] = [
    ['iphoneSafari', 5, 'ios'],
    ['iphoneChrome', 5, 'ios'],
    ['ipadDesktopMode', 5, 'ios'],
    ['androidChrome', 5, 'android'],
    ['androidFirefox', 5, 'android'],
    ['androidWebView', 5, 'other-browser'],
    ['instagramIos', 5, 'other-browser'],
    ['googleAppIos', 5, 'other-browser'],
    ['macSafari', 0, 'mac-safari'],
    ['macChrome', 0, 'mac-chrome'],
    ['macEdge', 0, 'mac-chrome'],
    ['macFirefox', 0, 'other-browser'],
    ['windowsEdge', 0, 'windows'],
    ['windowsFirefox', 0, 'other-browser'],
    ['chromeOs', 0, 'windows'],
    ['linuxChrome', 0, 'linux'],
    ['linuxFirefox', 0, 'other-browser'],
  ];
  it.each(cases)('%s → %s', (name, touchPoints, section) => {
    expect(getInstallGuideSection(UA[name], touchPoints)).toBe(section);
  });
  it('falls back to other-browser for an unknown user agent', () => {
    expect(getInstallGuideSection('')).toBe('other-browser');
  });
});

describe('installGuideUrl', () => {
  it('opens the guide at the section anchor', () => {
    expect(installGuideUrl('ios')).toBe('https://kring.ch/app-installieren#ios');
  });
});

describe('getInstallHint', () => {
  const base: InstallHintInput = { section: 'ios', canPrompt: false, isInstalled: false, isNative: false, isKiosk: false, dismissed: false };

  it('shows nothing in an installed app, the native app, to the kiosk or once dismissed', () => {
    expect(getInstallHint({ ...base, isInstalled: true })).toBe('none');
    expect(getInstallHint({ ...base, isNative: true })).toBe('none');
    expect(getInstallHint({ ...base, isKiosk: true })).toBe('none');
    expect(getInstallHint({ ...base, dismissed: true })).toBe('none');
  });
  it('offers the one-click install where the browser allows it', () => {
    expect(getInstallHint({ ...base, section: 'android', canPrompt: true })).toBe('install');
    expect(getInstallHint({ ...base, section: 'windows', canPrompt: true })).toBe('install');
  });
  it('links to the guide on iPhone/iPad, Mac Safari and browsers that cannot install', () => {
    expect(getInstallHint({ ...base, section: 'ios' })).toBe('guide');
    expect(getInstallHint({ ...base, section: 'mac-safari' })).toBe('guide');
    expect(getInstallHint({ ...base, section: 'other-browser' })).toBe('guide');
  });
  it('stays quiet in a Chromium browser without an install offer (usually installed already)', () => {
    expect(getInstallHint({ ...base, section: 'android' })).toBe('none');
    expect(getInstallHint({ ...base, section: 'mac-chrome' })).toBe('none');
    expect(getInstallHint({ ...base, section: 'linux' })).toBe('none');
  });
});
