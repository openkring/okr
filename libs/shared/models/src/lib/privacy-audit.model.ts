/**
 * The wire contract of the `runPrivacyAudit` callable (privacy 1.19, Phase 5D).
 *
 * **Not a persisted model.** Nothing here describes a Firestore document — the audit
 * result is ephemeral by decision (no persistence and no trend history in this slice).
 * It lives in `shared-models` for the same reason `privacy-rights.model` does: the Cloud
 * Function produces it and the admin screen renders it, and a second declaration on the
 * client would drift from the server's the first time a check is added.
 */

export type FindingSeverity = 'error' | 'warning' | 'info';

/**
 * One thing that is wrong.
 *
 * `titleDe` and `detailDe` are authored **server-side, in German, next to the check that
 * produces them, and rendered verbatim** — the honest wording lives with the rule, not in
 * a translation file that can drift from it. Only the screen's chrome is translated.
 *
 * `sampleKeys` holds **document ids only** — never a name, an e-mail or a vault value. The
 * callable re-validates this before returning: a finding is the one place where data from
 * every collection converges into a single document that gets rendered and printed.
 */
export interface PrivacyFinding {
  readonly checkId: number;
  readonly severity: FindingSeverity;
  readonly titleDe: string;
  readonly detailDe: string;
  /** Total offenders — may exceed `sampleKeys.length`, which is capped at ten. */
  readonly count: number;
  readonly sampleKeys: string[];
  /** Client route where a human fixes this. The audit itself never repairs anything. */
  readonly fixRoute: string;
}

export interface PrivacyAuditResult {
  readonly tenantId: string;
  /** StoreDate (`yyyyMMdd`). */
  readonly ranAt: string;
  /** Sorted `error` → `warning` → `info`, then by `checkId`. */
  readonly findings: PrivacyFinding[];
  readonly checksRun: number;
}
