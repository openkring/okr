// Spans are no-ops without browserTracingIntegration (removed 2026-09-04, spec 1.49 T1.8); the breadcrumbs and setMeasurement calls still report.
import { addBreadcrumb, setMeasurement, startInactiveSpan, startNewTrace, withActiveSpan } from '@sentry/angular';

/**
 * Startup instrumentation feeding Sentry Performance (not the Issues stream).
 *
 * Records `performance.now()` timestamps at each boundary of the bootstrap critical path
 * (AppCheck → bootstrap → auth restore → user/categories reads → app-ready) so the gaps
 * between marks show WHERE the startup time goes — no console or Network tab needed on the
 * device, because `reportStartupTiming()` also ships the numbers to Sentry as a standalone
 * `app.startup` transaction (one child span per phase, plus `startup.*` attributes and
 * total/first-script measurements), retrievable from the Performance dashboard on
 * iPhone/PWA/desktop alike. It is emitted as a transaction rather than an `info` message so
 * it never shows up as an Issue and is sampled by `tracesSampleRate` (not on every boot).
 *
 * `performance.now()` is milliseconds since navigation start, so the FIRST mark's `atMs`
 * already includes bundle download + parse (e.g. a large `atMs` on `appcheck:start` means
 * the app JS itself was slow to arrive — a service-worker/asset-download problem, not a
 * Firebase one). That leading gap is emitted as the `script-load` child span.
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

    // Emit a standalone `app.startup` transaction into Sentry Performance (NOT the Issues
    // stream). `performance.timeOrigin` is the epoch ms of navigation start, so a mark's
    // `performance.now()` value maps to an absolute time via `timeOrigin + atMs`. Using
    // explicit start/end times lets us backfill the true boot waterfall even though this runs
    // ~totalMs after navigation start (the browserTracing pageload transaction is long gone).
    // A fresh trace isolates it from any lingering navigation span; sampling is governed by
    // `tracesSampleRate`, so this no longer fires on every boot the way captureMessage did.
    const timeOrigin = performance.timeOrigin;
    const at = (ms: number) => new Date(timeOrigin + ms);

    startNewTrace(() => {
      const root = startInactiveSpan({
        name: 'app.startup',
        op: 'app.boot',
        forceTransaction: true,
        startTime: at(0),
        attributes: {
          'startup.mode': displayMode,
          'startup.reason': reason,
          'startup.net': net.effectiveType ?? 'unknown',
          'startup.downlink_mbps': net.downlinkMbps,
          'startup.rtt_ms': net.rttMs,
          'startup.sw': swControlled,
          'startup.persisted': storagePersisted ?? false,
          'startup.total_ms': totalMs,
          'startup.first_script_ms': firstScriptMs,
        },
      });

      withActiveSpan(root, () => {
        // Chartable numeric measurements on the transaction.
        setMeasurement('startup.total', totalMs, 'millisecond');
        setMeasurement('startup.first_script', firstScriptMs, 'millisecond');

        // Bundle download + parse + SW (navigation start → first mark).
        if (firstScriptMs > 0) {
          startInactiveSpan({ name: 'script-load', op: 'app.boot.phase', startTime: at(0) }).end(at(firstScriptMs));
        }
        // One child span per phase, spanning the gap that leads up to each mark.
        for (let i = 1; i < entries.length; i++) {
          const [label, t] = entries[i];
          startInactiveSpan({ name: label, op: 'app.boot.phase', startTime: at(entries[i - 1][1]) }).end(at(t));
        }
      });

      root.end(at(totalMs));
    });
  });
}
