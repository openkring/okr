/**
 * Which device and browser the app runs in, and which part of the install guide fits it.
 * Spec 1.99 A1/A2.
 *
 * Pure functions over the user agent (and `navigator.maxTouchPoints`), so every row of the guide
 * is unit-tested. `isIOS` / `isAndroid` / `isMacOS` in `@okr/shared-util-angular` delegate here;
 * there is no second detection.
 */

/** The sections of the install guide, one per case (spec 1.99 A1). Also the anchors of the page. */
export type InstallGuideSection = 'ios' | 'android' | 'mac-chrome' | 'mac-safari' | 'windows' | 'linux' | 'other-browser';

/**
 * The install guide, published from kring-app to kring-website (spec 1.99 A1). One page for every
 * tenant app; a section is opened with `#<section>`.
 */
export const INSTALL_GUIDE_URL = 'https://kring.ch/app-installieren';

/** The guide, opened at one section. */
export function installGuideUrl(section: InstallGuideSection): string {
  return `${INSTALL_GUIDE_URL}#${section}`;
}

/**
 * iPhone, iPod or iPad. Since iPadOS 13, Safari on an iPad reports itself as a Mac
 * («Macintosh»); only the touch points tell the two apart (a Mac has none).
 */
export function isIOSUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return /android/i.test(userAgent);
}

/** A real Mac: «Macintosh» without touch points (an iPad says «Macintosh» too, see isIOSUserAgent). */
export function isMacUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  return /macintosh/i.test(userAgent) && !isIOSUserAgent(userAgent, maxTouchPoints);
}

/**
 * The browser built into another app (Instagram, Facebook, LinkedIn, the Google app, WhatsApp,
 * Line, WeChat, or an Android WebView). None of them can install a web app: the member has to open
 * the page in Safari or Chrome first.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|\bGSA\/|WhatsApp|\bLine\/|MicroMessenger|Snapchat|TikTok|Twitter/i.test(userAgent)
    || (isAndroidUserAgent(userAgent) && /;\s*wv\)/.test(userAgent));
}

function isFirefoxUserAgent(userAgent: string): boolean {
  return /firefox|fxios/i.test(userAgent);
}

/** Chrome, Edge, Opera, Brave and the other Chromium browsers (all of them install the same way). */
function isChromiumUserAgent(userAgent: string): boolean {
  return /chrome|chromium|crios|edg\/|edgios|opr\//i.test(userAgent);
}

/**
 * The section of the install guide for this device and browser.
 *
 * - An in-app browser always gets `other-browser`: it cannot install, whatever the device.
 * - iPhone and iPad: `ios`. Since iOS 16.4 Chrome and Edge offer «Zum Home-Bildschirm» in the share
 *   sheet too, so the browser does not matter there.
 * - Android: `android` (Chrome, Samsung Internet and Firefox all install).
 * - Firefox on a computer cannot install a web app: `other-browser`.
 * - Mac: Safari → `mac-safari` («Zum Dock hinzufügen»), a Chromium browser → `mac-chrome`.
 * - Windows and ChromeOS → `windows` (the install symbol in Chrome's or Edge's address bar).
 * - Linux → `linux`. Anything else → `other-browser`.
 */
export function getInstallGuideSection(userAgent: string, maxTouchPoints = 0): InstallGuideSection {
  if (isInAppBrowser(userAgent)) return 'other-browser';
  if (isIOSUserAgent(userAgent, maxTouchPoints)) return 'ios';
  if (isAndroidUserAgent(userAgent)) return 'android';
  if (isFirefoxUserAgent(userAgent)) return 'other-browser';
  if (isMacUserAgent(userAgent, maxTouchPoints)) return isChromiumUserAgent(userAgent) ? 'mac-chrome' : 'mac-safari';
  if (/windows|cros/i.test(userAgent)) return isChromiumUserAgent(userAgent) ? 'windows' : 'other-browser';
  if (/linux|x11/i.test(userAgent)) return isChromiumUserAgent(userAgent) ? 'linux' : 'other-browser';
  return 'other-browser';
}

/** What the install hint offers, or `none` (spec 1.99 A2). */
export type InstallHintKind = 'install' | 'guide' | 'none';

export interface InstallHintInput {
  section: InstallGuideSection;
  /** the browser offered a one-click install (`beforeinstallprompt` arrived) */
  canPrompt: boolean;
  /** running as an installed app (isInstalledDisplayMode) */
  isInstalled: boolean;
  /** the native Capacitor app */
  isNative: boolean;
  /** the kiosk-only user (roles.kiosk) */
  isKiosk: boolean;
  /** the member closed the hint in this browser before */
  dismissed: boolean;
}

/**
 * Which hint to show (spec 1.99 A2): never in an installed or native app, never to the kiosk, never
 * again once dismissed. Where the browser offers a one-click install, the hint is that button.
 * Without it, the hint links to the guide only where installing takes steps the member cannot see:
 * iPhone/iPad, Safari on a Mac and a browser that cannot install. A Chromium browser that sends no
 * `beforeinstallprompt` has usually installed the app already, so it gets no hint.
 */
export function getInstallHint(input: InstallHintInput): InstallHintKind {
  if (input.isInstalled || input.isNative || input.isKiosk || input.dismissed) return 'none';
  if (input.canPrompt) return 'install';
  return input.section === 'ios' || input.section === 'mac-safari' || input.section === 'other-browser' ? 'guide' : 'none';
}
