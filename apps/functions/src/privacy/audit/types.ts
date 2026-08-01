import type { AppConfig, PrivacyAuditResult, PrivacyFinding } from '@okr/shared-models';

/**
 * The wire types live in `@okr/shared-models/privacy-audit.model` — the admin screen
 * renders exactly what this callable returns, and a second declaration on the client
 * would drift the first time a check is added. Re-exported under the local names the
 * check files use so the audit module keeps importing its vocabulary from one place.
 */
export type Finding = PrivacyFinding;
export type AuditResult = PrivacyAuditResult;
export type { PrivacyAuditResult, PrivacyFinding } from '@okr/shared-models';

/**
 * The privacy audit (spec 1.19 Phase 5D) — eleven conformance checks run on demand
 * against one tenant, returning findings and repairing nothing.
 *
 * **The audit reads; it never writes.** No check may fix what it finds. Every finding
 * carries a `fixRoute` pointing at the screen where a human does.
 */

/**
 * Everything a check may read, **injected rather than fetched**, so every check is unit
 * testable without an emulator. `load` is lazy — a check that needs no collection pays
 * for nothing — and memoised by the callable, so two checks over `persons` cost one read.
 */
export interface AuditCtx {
  readonly tenantId: string;
  readonly config: AppConfig;
  readonly load: (collection: string) => Promise<AuditDoc[]>;
  readonly listCollections: () => Promise<string[]>;
}

/** A Firestore document reduced to what a check may see: its id and its fields. */
export interface AuditDoc {
  readonly okey: string;
  readonly data: Record<string, unknown>;
  /**
   * Server-side last-write time in epoch millis, from the snapshot's `updateTime`.
   *
   * No model in this repo carries a `modifiedAt` field, so the staleness check (3) has
   * nothing of its own to compare. Firestore hands `updateTime` back on every read for
   * free, and it cannot be forged by a client write — which makes it a better source than
   * a field we would have had to add and then trust.
   *
   * `undefined` only in tests that do not care about time.
   */
  readonly updatedAt?: number;
}

export interface AuditCheck {
  readonly id: number;
  readonly severity: Finding['severity'];
  readonly titleDe: string;
  /** `undefined` = clean. */
  readonly run: (ctx: AuditCtx) => Promise<Finding | undefined>;
}

/** Cap on `sampleKeys`. A finding is a pointer to a problem, not a data export. */
export const MAX_SAMPLE_KEYS = 10;

/** Build a finding from a check and the documents that failed it. */
export function toFinding(
  check: Pick<AuditCheck, 'id' | 'severity' | 'titleDe'>,
  detailDe: string,
  fixRoute: string,
  offenders: readonly string[],
): Finding | undefined {
  if (offenders.length === 0) return undefined;
  return {
    checkId: check.id,
    severity: check.severity,
    titleDe: check.titleDe,
    detailDe,
    count: offenders.length,
    sampleKeys: offenders.slice(0, MAX_SAMPLE_KEYS),
    fixRoute,
  };
}
