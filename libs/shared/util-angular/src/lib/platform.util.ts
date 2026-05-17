import { isBrowser } from '@bk2/shared-util-core';

export { isBrowser };

export type BrowserName = 'safari' | 'chrome' | 'firefox' | 'opera' | 'other';

/**
 * Detects the current browser via UA string. Order matters: Opera and Firefox
 * must be checked before Chrome/Safari since their UA strings also contain "Safari".
 */
export function getBrowser(): BrowserName {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent ?? '';
  if (/OPR\/|opera/i.test(ua)) return 'opera';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/chrome|chromium|crios/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}

export function isSafari(): boolean { return getBrowser() === 'safari'; }
export function isChrome(): boolean { return getBrowser() === 'chrome'; }
export function isFirefox(): boolean { return getBrowser() === 'firefox'; }
export function isOpera(): boolean { return getBrowser() === 'opera'; }

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

// iPadOS 13+ reports "Macintosh" in its UA, so exclude iPhone/iPad/iPod explicitly.
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /macintosh/i.test(ua) && !/iphone|ipad|ipod/i.test(ua);
}
