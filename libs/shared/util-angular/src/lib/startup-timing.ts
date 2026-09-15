// Tracing was removed with browserTracingIntegration (2026-09-04, spec 1.49 T1.8). The span APIs
// were no-ops from that day on, but importing them kept the whole tracing half of @sentry/core
// bound into the eager bundle, so they are gone. setMeasurement went with them: its body is
// `const rootSpan = activeSpan && getRootSpan(activeSpan); if (rootSpan) {…}`, so without an
// active span it never recorded anything either. The numbers it used to carry (total, first
// script) now travel on the breadcrumb, which does report.
import { addBreadcrumb, captureMessage } from '@sentry/angular';

/**
 * Startup instrumentation, reported to the console and as a Sentry breadcrumb.
 *
 * Records `performance.now()` timestamps at each boundary of the bootstrap critical path
 * (AppCheck → bootstrap → auth restore → user/categories reads → app-ready) so the gaps
 * between marks show WHERE the startup time goes — no console or Network tab needed on the
 * device, because `reportStartupTiming()` also attaches the numbers to Sentry as a breadcrumb
 * (`category: 'startup'`), so they ride along on whatever error the session later reports.
 * There is no transaction: this app runs without tracing, so nothing here reaches the
 * Performance dashboard. Read the values off the breadcrumb of an Issue, or off the console
 * line below.
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

  const { displayMode, net, swControlled, persistedP } = probeEnvironment();

  persistedP.then((storagePersisted: boolean | undefined) => {
    const context = { reason, totalMs, firstScriptMs, displayMode, swControlled, storagePersisted, net, marks, rows };

    console.log(`[startup-timing] mode=${displayMode} reason=${reason} total=${totalMs}ms firstScript=${firstScriptMs}ms sw=${swControlled} persisted=${storagePersisted}`, context);

    // `data` carries the phase marks plus the two aggregates that used to be emitted as span
    // measurements — without a span there is nowhere else for them to go.
    addBreadcrumb({
      category: 'startup',
      level: 'info',
      message: `startup-timing mode=${displayMode} reason=${reason} total=${totalMs}ms`,
      data: { ...marks, 'startup.total_ms': totalMs, 'startup.first_script_ms': firstScriptMs },
    });
  });
}

/**
 * Everything about the delivery environment that a timing number alone cannot explain.
 * Shared by the success report and the stall report below — a stalled boot needs exactly the
 * same context (was the service worker in charge? was the cache evicted? what network?), and
 * duplicating it is how the two would drift apart.
 *
 * - displayMode separates an installed/standalone PWA from a normal browser tab.
 *   navigator.standalone is the iOS-only signal; the media query covers desktop/Android.
 * - net is Chromium-only (undefined on Safari, which is itself a signal).
 * - swControlled === false means the ngsw service worker was NOT in charge (first visit, or it
 *   failed/was evicted), so every asset came off the network — the prime suspect for a large
 *   firstScriptMs.
 * - storagePersisted === false means the Cache Storage is unprotected from Safari's ITP
 *   eviction, i.e. the app may have been re-downloaded in full.
 */
function probeEnvironment() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  const displayMode: string =
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || nav.standalone === true
      ? 'standalone'
      : 'browser';
  const conn = nav.connection ?? {};
  const net = {
    effectiveType: conn.effectiveType as string | undefined,
    downlinkMbps: conn.downlink as number | undefined,
    rttMs: conn.rtt as number | undefined,
    saveData: conn.saveData as boolean | undefined,
  };
  const swControlled = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  const persistedP: Promise<boolean | undefined> =
    typeof navigator !== 'undefined' && nav.storage?.persisted
      ? nav.storage.persisted().catch(() => undefined)
      : Promise.resolve(undefined);
  return { displayMode, net, swControlled, persistedP };
}

/**
 * How long the app may stay not-ready before the stall reports itself.
 *
 * Deliberately longer than READINESS_TIMEOUT_MS (10 s, the point at which the readiness
 * watchdog unblocks navigation): a boot that the watchdog rescues is slow, not stuck, and
 * would otherwise open a ticket on every slow phone.
 */
export const STARTUP_STALL_MS = 12_000;

/**
 * A stall timer that fires later than this many times its own delay did not measure a stall,
 * it measured a suspend: the tab was discarded, the laptop lid was closed, the phone slept.
 * Firestore and the auth SDK reconnect AFTER such a wake-up, so judging readiness at the very
 * moment the throttled timer finally runs reports a boot that is about to finish (SCS-AR: a
 * 12 s timer that ran after 41 minutes, with auth long restored and the user doc one reconnect
 * away).
 */
export const STARTUP_STALL_OVERSHOOT_FACTOR = 2;

/** How often an overshooting timer is re-armed before the stall is reported regardless. */
export const STARTUP_STALL_MAX_REARMS = 3;

/**
 * Arm the stall check: after STARTUP_STALL_MS, report the open gate unless the app is ready.
 *
 * Wall-clock aware. If the timer fires far later than it was scheduled (see
 * STARTUP_STALL_OVERSHOOT_FACTOR) the boot was suspended, not stalled, and the check is
 * re-armed for another full window so the SDKs get their reconnect before we judge. A bounded
 * number of re-arms keeps a genuinely stuck boot from hiding behind repeated throttling.
 *
 * @param isReady the readiness signal, read at fire time
 * @param openGate names the gate still holding navigation, read only when reporting
 * @param now injectable clock for tests; defaults to Date.now
 */
export function armStartupStallCheck(
  isReady: () => boolean,
  openGate: () => string,
  now: () => number = Date.now,
): void {
  let rearms = 0;
  const arm = (): void => {
    const armedAt = now();
    setTimeout(() => {
      if (isReady()) return;
      const overshot = now() - armedAt > STARTUP_STALL_MS * STARTUP_STALL_OVERSHOOT_FACTOR;
      if (overshot && rearms < STARTUP_STALL_MAX_REARMS) {
        rearms++;
        markStartup(`stall-check:rearmed:${rearms}`);
        arm();
        return;
      }
      reportStartupStall(openGate());
    }, STARTUP_STALL_MS);
  };
  arm();
}

let stallReported = false;

/**
 * Report a boot that never became ready.
 *
 * This exists because the success path could not see this class of failure at all.
 * `reportStartupTiming` only runs WHEN the app becomes ready, and it writes a breadcrumb —
 * which reaches Sentry only if some later error carries it. A boot that simply hangs produces
 * no error, so it produced no breadcrumb, no issue, no data: the user sees a spinner forever
 * and we learn nothing. Hence `captureMessage`, which opens an issue in its own right.
 *
 * @param gate which readiness gate was still open — the one thing the marks alone don't say.
 */
export function reportStartupStall(gate: string): void {
  if (stallReported || reported || typeof performance === 'undefined') return;
  // A backgrounded tab is not a stalled boot: timers are throttled there and the user is not
  // looking at a spinner. Reporting those would bury the real ones.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  stallReported = true;

  const marks: Record<string, number> = {};
  for (const [label, t] of startupMarks) marks[label] = Math.round(t);
  const { displayMode, net, swControlled, persistedP } = probeEnvironment();
  const elapsedMs = Math.round(performance.now());

  persistedP.then((storagePersisted: boolean | undefined) => {
    const context = { gate, elapsedMs, displayMode, swControlled, storagePersisted, net, marks };
    console.warn(`[startup-stall] gate=${gate} after ${elapsedMs}ms`, context);
    captureMessage(`startup stalled at ${gate}`, {
      level: 'warning',
      tags: { startupGate: gate, displayMode, swControlled: String(swControlled) },
      extra: context,
    });
  });
}
