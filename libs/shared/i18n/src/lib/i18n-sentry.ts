import { Injectable } from '@angular/core';
import { captureMessage } from '@sentry/angular';
import type {
  HashMap,
  TranslocoMissingHandler,
  TranslocoMissingHandlerData,
} from '@jsverse/transloco';

/** Why an i18n key could not be resolved. Becomes a Sentry tag + fingerprint. */
export type I18nIssueReason = 'missing-key' | 'scope-load-failed';

/**
 * Keys already reported this session. A missing key typically renders on every
 * instantiation of the offending component, so without dedup Sentry would be
 * flooded with identical events. We report each unique (reason, key) once.
 * Bounded so a pathological run can never grow the set without limit.
 */
const reported = new Set<string>();
const MAX_TRACKED = 500;

/**
 * Report a missing or unresolvable i18n key to Sentry — once per unique
 * (reason, key). A no-op when Sentry is not initialised (dev without a DSN):
 * `captureMessage` simply drops, and `beforeSend()` drops any 'development'
 * event as a backstop, so this only surfaces on staging/production.
 *
 * @returns true if this was a newly-reported issue, false if already seen.
 */
export function reportI18nIssue(key: string, reason: I18nIssueReason): boolean {
  const id = `${reason}:${key}`;
  if (reported.has(id)) return false;
  if (reported.size >= MAX_TRACKED) reported.clear();
  reported.add(id);

  captureMessage(`i18n ${reason}: ${key}`, {
    level: 'warning',
    // Filterable/groupable in the Sentry dashboard.
    tags: { 'i18n.reason': reason, 'i18n.key': key },
    // One issue per (reason, key), independent of the surrounding stack trace.
    fingerprint: ['i18n', reason, key],
  });
  return true;
}

/**
 * Asks whether a missing key is version skew rather than a real gap, and recovers from it.
 *
 * The i18n JSON files sit at fixed URLs (`/assets/i18n/<scope>/<lang>.json`) and Firebase
 * Hosting serves only the current deploy. A client that keeps an old build open across a
 * release (a kiosk, a tab left open overnight) therefore loads the NEW strings into its OLD
 * code: keys that were renamed or removed come back missing (SCS-JP/JQ/JR). A query string
 * cannot fix that — the old file no longer exists on the server — so the check compares the
 * live deploy's version with this build's and, on a mismatch, moves the client to the new build.
 *
 * Resolves `true` when it found skew (and started a reload) — the miss is then not reported.
 * Registered by `VersionCheckService` (shared-util-angular owns the build version; importing it
 * here would make a cycle). Without a registration every miss is reported as before.
 */
export type I18nSkewCheck = () => Promise<boolean>;

let skewCheck: I18nSkewCheck | undefined;

/** Register (or clear, with `undefined`) the skew check that runs before a missing key is reported. */
export function setI18nSkewCheck(check: I18nSkewCheck | undefined): void {
  skewCheck = check;
}

/** Keys already handed to the skew check this session — a missing key renders many times. */
const pendingMisses = new Set<string>();

/**
 * Report a missing key unless it turns out to be version skew. Deduped per key, like
 * `reportI18nIssue`; a failing check falls back to reporting.
 */
export function reportMissingKey(key: string): void {
  const check = skewCheck;
  if (!check) {
    reportI18nIssue(key, 'missing-key');
    return;
  }
  if (pendingMisses.has(key)) return;
  if (pendingMisses.size >= MAX_TRACKED) pendingMisses.clear();
  pendingMisses.add(key);
  check().then(
    (skewed) => { if (!skewed) reportI18nIssue(key, 'missing-key'); },
    () => reportI18nIssue(key, 'missing-key'),
  );
}

/**
 * Transloco missing-key handler. Preserves the framework default behaviour
 * (dev-only console.warn + return the key so the UI degrades to showing the raw
 * key) and additionally forwards the miss to Sentry (deduped) on staging/prod,
 * unless the miss is version skew (see `setI18nSkewCheck`).
 */
@Injectable({ providedIn: 'root' })
export class SentryMissingHandler implements TranslocoMissingHandler {
  public handle(key: string, data: TranslocoMissingHandlerData, _params?: HashMap): string {
    if (data.missingHandler.logMissingKey && !data.prodMode) {
      console.warn(`%c Missing translation for '${key}'`, 'font-size: 12px; color: red');
    }
    reportMissingKey(key);
    return key;
  }
}

/**
 * Whether the document is currently being torn down (reload, navigation away, tab close).
 *
 * Mobile Safari aborts every in-flight request at that moment, so an i18n scope whose
 * `<lang>.json` fetch fails in this window says nothing about the scope — the asset is
 * fine, the user simply left. Reporting it anyway opens one permanent Sentry issue per
 * key that no code change can close.
 *
 * Reset on `pageshow` so a bfcache restore does not silence a genuinely broken scope for
 * the rest of the session.
 */
let pageUnloading = false;

if (typeof window !== 'undefined') {
  const enter = () => (pageUnloading = true);
  window.addEventListener('pagehide', enter, { capture: true });
  window.addEventListener('beforeunload', enter, { capture: true });
  window.addEventListener('pageshow', () => (pageUnloading = false), { capture: true });
}

/** @see pageUnloading */
export function isPageUnloading(): boolean {
  return pageUnloading;
}
