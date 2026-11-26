import { Capacitor } from '@capacitor/core';
import {
  getDisplayMode, getInstallGuideSection, InstallGuideSection, isAndroidUserAgent, isBrowser, isInstalledDisplayMode, isIOSUserAgent,
  isMacUserAgent,
} from '@okr/shared-util-core';

export { isBrowser };

/** True when running inside the native Capacitor app (iOS/Android), false for web/PWA. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * The native app ships its web layer inside the binary, so the ngsw cache can only ever serve a
 * STALE copy after a store update (spec 1.10 §14 Phase 1). app.config disables registration on
 * native; this removes workers that an earlier build already registered. No-op on web/PWA.
 */
/**
 * On Android, @capacitor/google-maps draws the native map BENEATH the WebView, so every element
 * above it must be transparent or the map shows white (plugin README). This adds one global style
 * that clears the background of exactly the ANCESTORS of a map (`:has(capacitor-google-map)`), so
 * cards next to the map and other pages keep theirs. Call before `GoogleMap.create`. No-op on web
 * and iOS, which render the map inside the WebView.
 */
export function ensureNativeMapTransparency(): void {
  const id = 'okr-native-map-transparency';
  if (Capacitor.getPlatform() !== 'android' || typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent =
    'html:has(capacitor-google-map), :is(body, ion-app, ion-router-outlet, ion-nav, ion-tabs, .ion-page, ion-content, ' +
    'ion-card, ion-card-content, ion-grid, ion-row, ion-col, div, section):has(capacitor-google-map) ' +
    '{ background: transparent !important; --background: transparent !important; }';
  document.head.appendChild(style);
}

export async function unregisterServiceWorkersOnNative(): Promise<number> {
  if (!isNativePlatform() || typeof navigator === 'undefined' || !navigator.serviceWorker) return 0;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  return registrations.length;
}

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

/**
 * iPhone, iPod or iPad. An iPad on iPadOS 13+ reports «Macintosh»; its touch points give it away
 * (isIOSUserAgent). Until 2026-11-26 this read the user agent alone, so an iPad counted as a Mac.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIOSUserAgent(navigator.userAgent, navigator.maxTouchPoints);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isAndroidUserAgent(navigator.userAgent);
}

/** A real Mac; an iPad, which also reports «Macintosh», is not one (isMacUserAgent). */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isMacUserAgent(navigator.userAgent, navigator.maxTouchPoints);
}

/** The section of the install guide for this device and browser (spec 1.99 A1). */
export function getCurrentInstallGuideSection(): InstallGuideSection {
  if (typeof navigator === 'undefined') return 'other-browser';
  return getInstallGuideSection(navigator.userAgent, navigator.maxTouchPoints);
}

/** Runs as an installed app (any app display mode, or iOS's Home Screen flag), not in a browser tab. Spec 1.99 A5. */
export function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return isInstalledDisplayMode(getDisplayMode(
    window.matchMedia ? (q) => window.matchMedia(q).matches : undefined,
    (navigator as { standalone?: boolean }).standalone,
  ));
}
