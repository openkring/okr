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

  // eslint-disable-next-line no-console
  console.log(`[startup-timing] reason=${reason} total=${totalMs}ms`, rows);

  addBreadcrumb({
    category: 'startup',
    level: 'info',
    message: `startup-timing reason=${reason} total=${totalMs}ms`,
    data: marks,
  });
  captureMessage(`startup-timing total=${totalMs}ms reason=${reason}`, {
    level: 'info',
    extra: { reason, totalMs, marks, rows },
  });
}
