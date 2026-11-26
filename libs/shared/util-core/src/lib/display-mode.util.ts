/**
 * How the web app is shown: as an installed app (`standalone`, `fullscreen`, `minimal-ui`) or in a
 * browser tab (`browser`). Spec 1.99 A5.
 *
 * A manifest may ask for other modes than `display: standalone` (via `display_override`), and the
 * browser then picks the first one it supports. An install can therefore run in any of the three
 * app modes; asking only for `(display-mode: standalone)` counts the other two as a browser tab.
 */
export type DisplayMode = 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';

/** The app modes, most specific first; the order the media queries are asked in. */
const APP_DISPLAY_MODES: readonly Exclude<DisplayMode, 'browser'>[] = ['fullscreen', 'standalone', 'minimal-ui'];

/**
 * The current display mode.
 *
 * @param matches answers a media query, normally `q => window.matchMedia(q).matches`;
 *   undefined where there is no `matchMedia` (SSR, old browsers)
 * @param navigatorStandalone iOS Safari's own flag (`navigator.standalone`), true in a Home Screen
 *   app. iOS ignores `display_override`, so this flag and the `standalone` query agree there.
 */
export function getDisplayMode(matches: ((query: string) => boolean) | undefined, navigatorStandalone?: boolean): DisplayMode {
  if (matches) {
    for (const mode of APP_DISPLAY_MODES) {
      if (matches(`(display-mode: ${mode})`)) return mode;
    }
  }
  return navigatorStandalone === true ? 'standalone' : 'browser';
}

/** Whether the mode is an installed app rather than a browser tab. */
export function isInstalledDisplayMode(mode: DisplayMode): boolean {
  return mode !== 'browser';
}
