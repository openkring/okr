import { addBreadcrumb, captureMessage } from '@sentry/angular';

/**
 * TEMPORARY startup instrumentation (remove once the slow-startup investigation is done).
 *
 * Records `performance.now()` timestamps at each boundary of the bootstrap critical path
 * (AppCheck → bootstrap → auth restore → user/categories reads → app-ready) so the gaps
 * between marks show WHERE the startup time goes — no console or Network tab needed on the
 * device, because `reportStartupTiming()` also ships the numbers to Sentry as an info-level
 * event + breadcrumb, retrievable from the dashboard on iPhone/PWA/desktop alike.
 *
 * `performance.now()` is milliseconds since navigation start, so the FIRST mark's `atMs`
 * already includes bundle download + parse (e.g. a large `atMs` on `appcheck:start` means
 * the app JS itself was slow to arrive — a service-worker/asset-download problem, not a
 * Firebase one).
 */
const startupMarks = new Map<string, number>();
let reported = false;

/** Record a startup boundary once. Later calls with the same label are ignored. */
export function markStartup(label: string): void {
  if (typeof performance === 'undefined') return;
  if (!startupMarks.has(label)) startupMarks.set(label, performance.now());
}

/**
 * Flush the recorded marks to console + Sentry. Idempotent (only the first call reports).
 * @param reason why the app became ready ('data-ready' vs 'watchdog') — 'watchdog' plus a
 *   missing `user:loaded` mark proves the users/{uid} read hung.
 */
export function reportStartupTiming(reason: string): void {
  if (reported || typeof performance === 'undefined') return;
  reported = true;

  const entries = [...startupMarks.entries()].sort((a, b) => a[1] - b[1]);
  const marks: Record<string, number> = {};
  let prev = 0;
  const rows = entries.map(([label, t], i) => {
    const deltaMs = i === 0 ? 0 : Math.round(t - prev);
    prev = t;
    marks[label] = Math.round(t);
    return { label, atMs: Math.round(t), deltaMs };
  });
  const totalMs = entries.length ? Math.round(entries[entries.length - 1][1]) : 0;
  // Time before the app's own JS started executing (bundle download + parse + SW), taken
  // from the first mark's atMs. Big value => asset-delivery problem, not a Firebase one.
  const firstScriptMs = entries.length ? Math.round(entries[0][1]) : 0;

  // Display mode: separates an installed/standalone PWA from a normal browser tab so the two
  // can be compared in Sentry. navigator.standalone is the iOS-only signal; the media query
  // covers desktop/Android installs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  const displayMode: string =
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || nav.standalone === true
      ? 'standalone'
      : 'browser';

  // Network conditions (Chromium-only API; undefined on Safari, which is itself a signal).
  // rttMs/downlink tell us whether the ~3s user-doc read is network-bound or long-poll setup.
  const conn = nav.connection ?? {};
  const net = {
    effectiveType: conn.effectiveType as string | undefined,
    downlinkMbps: conn.downlink as number | undefined,
    rttMs: conn.rtt as number | undefined,
    saveData: conn.saveData as boolean | undefined,
  };

  // Is THIS load served by the ngsw service worker? controller===null means the SW isn't in
  // charge (first visit, or it failed/was evicted), so every asset came off the network — the
  // prime suspect for a large firstScriptMs on repeat Safari/PWA loads.
  const swControlled = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

  // storage.persisted() tells us whether the ngsw Cache Storage is protected from Safari's ITP
  // eviction. If false on a repeat load with a large firstScriptMs, the cache was likely evicted
  // and the app re-downloaded — pointing the fix at shrinking the cached footprint.
  const persistedP: Promise<boolean | undefined> =
    typeof navigator !== 'undefined' && nav.storage?.persisted
      ? nav.storage.persisted().catch(() => undefined)
      : Promise.resolve(undefined);

  persistedP.then((storagePersisted: boolean | undefined) => {
    const context = { reason, totalMs, firstScriptMs, displayMode, swControlled, storagePersisted, net, marks, rows };

    // eslint-disable-next-line no-console
    console.log(`[startup-timing] mode=${displayMode} reason=${reason} total=${totalMs}ms firstScript=${firstScriptMs}ms sw=${swControlled} persisted=${storagePersisted}`, context);

    addBreadcrumb({
      category: 'startup',
      level: 'info',
      message: `startup-timing mode=${displayMode} reason=${reason} total=${totalMs}ms`,
      data: marks,
    });
    captureMessage(`startup-timing total=${totalMs}ms mode=${displayMode} reason=${reason}`, {
      level: 'info',
      // Tags are filterable/groupable in the Sentry dashboard (extra is not).
      tags: {
        'startup.mode': displayMode,
        'startup.reason': reason,
        'startup.net': net.effectiveType ?? 'unknown',
        'startup.sw': String(swControlled),
        'startup.persisted': String(storagePersisted),
      },
      extra: context,
    });
  });
}
