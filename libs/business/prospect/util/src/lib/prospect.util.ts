import { ProspectModel, ProspectStatus } from '@okr/shared-models';
import { addDuration, getTodayStr, isAfterOrEqualDate } from '@okr/shared-util-core';

/**
 * The deal-registration rules of C5 §3, as pure functions.
 *
 * All four decisions of §7 (agreed 2026-08-07) live here:
 *  - **conversion is observed, never self-declared** — only a C3 metering push naming the tenant
 *    converts a lead, so a partner cannot register revenue by asserting it;
 *  - **a claim protects the account for three months**, then returns it to open competition;
 *  - **a consent revocation beats an active claim, immediately**;
 *  - **a partner may decline early**, returning the lead at once instead of letting it rot.
 *
 * Dates are `DateFormat.StoreDate` strings throughout (`yyyymmdd…`) and are compared with the
 * shared date utilities — never with `Date` arithmetic of our own (CLAUDE.md).
 */

/** The D7 protection window (C5 §3). */
export const CLAIM_MONTHS = 3;

/** Retention of an unconverted lead, in months — the existing `APPLICATION_RECORD` tier (§7). */
export const PROSPECT_RETENTION_MONTHS = 24;

export interface ClaimResult {
  ok: boolean;
  /** Why a claim was refused — a partner-facing reason, not an exception. */
  reason?: 'not-open' | 'withdrawn' | 'already-claimed';
  prospect: ProspectModel;
}

/** A lead is claimable only while it is genuinely in the pool. */
export function canClaim(prospect: ProspectModel, today = getTodayStr()): boolean {
  if (prospect.revokedAt.length > 0) return false;
  if (prospect.status === 'open') return true;
  // A claim whose window has elapsed is claimable again even before the sweep has run: the
  // expiry is a fact about the date, not about whether a scheduled job has noticed it yet.
  return prospect.status === 'claimed' && isClaimExpired(prospect, today);
}

export function isClaimExpired(prospect: ProspectModel, today = getTodayStr()): boolean {
  if (prospect.status !== 'claimed' || prospect.claimExpiresAt.length === 0) return false;
  return isAfterOrEqualDate(today, prospect.claimExpiresAt);
}

/**
 * Claim a lead for a partner — this IS the deal registration (C5 §1), not a separate step.
 *
 * Returns a NEW model rather than mutating: the caller writes it, and a refused claim must leave
 * the stored record byte-identical so two partners racing on the same lead cannot both half-write.
 */
export function claimProspect(
  prospect: ProspectModel, partnerKey: string, today = getTodayStr(),
): ClaimResult {
  if (prospect.revokedAt.length > 0) {
    return { ok: false, reason: 'withdrawn', prospect };
  }
  if (!canClaim(prospect, today)) {
    return {
      ok: false,
      reason: prospect.status === 'claimed' ? 'already-claimed' : 'not-open',
      prospect,
    };
  }
  return {
    ok: true,
    prospect: {
      ...prospect,
      status: 'claimed',
      claimedByPartnerKey: partnerKey,
      claimedAt: today,
      claimExpiresAt: addDuration(today, { months: CLAIM_MONTHS }),
    },
  };
}

/**
 * Return an expired or declined claim to the pool.
 *
 * `expired` and a voluntary early decline produce the same end state — the lead is open again —
 * but only the expiry marks the record, because "this partner gave it back" and "this partner sat
 * on it for three months" are different facts about the partner, and the pool should not blur them.
 */
export function releaseClaim(prospect: ProspectModel, declined = false): ProspectModel {
  if (prospect.status !== 'claimed') return prospect;
  return {
    ...prospect,
    status: declined ? 'open' : 'expired',
    claimedByPartnerKey: '',
    claimedAt: '',
    claimExpiresAt: '',
  };
}

/** After a sweep, `expired` leads are back in the pool — the status is a record of what happened. */
export function isInPool(prospect: ProspectModel, today = getTodayStr()): boolean {
  if (prospect.revokedAt.length > 0 || prospect.status === 'converted') return false;
  return prospect.status === 'open' || prospect.status === 'expired'
    || (prospect.status === 'claimed' && isClaimExpired(prospect, today));
}

/**
 * Mark a lead converted — **only** from an observed C3 metering push (§7).
 *
 * `tenantId` is the partner tenant that appeared in the payload; the claim holder must match, or
 * the push is naming a lead that is not theirs and the conversion is refused. That is the whole
 * anti-self-declaration property: a partner cannot convert a lead they do not hold.
 */
export function convertProspect(
  prospect: ProspectModel, partnerKey: string, tenantId: string, today = getTodayStr(),
): ProspectModel | undefined {
  if (prospect.status !== 'claimed' || prospect.claimedByPartnerKey !== partnerKey) return undefined;
  return {
    ...prospect,
    status: 'converted',
    convertedTenantId: tenantId,
    convertedAt: today,
  };
}

/**
 * Apply a consent revocation. Effective against bkaiser **immediately**, whatever the claim state.
 *
 * The record is kept in `withdrawn` (not deleted here) for exactly as long as it takes to notify
 * the claiming partner — `partnerToNotify` is that address. Their own copy is their own duty: they
 * became an independent controller the moment they received the lead (Vertragswerk Teil III.2),
 * and bkaiser cannot delete data inside a partner's installation. The erasure of the prospect's own
 * data in `kring` runs through `subject-data-map.ts` like every other subject.
 */
export function revokeConsent(
  prospect: ProspectModel, today = getTodayStr(),
): { prospect: ProspectModel; partnerToNotify: string } {
  const partnerToNotify = prospect.status === 'claimed' ? prospect.claimedByPartnerKey : '';
  return {
    prospect: {
      ...prospect,
      status: 'withdrawn',
      revokedAt: today,
      claimedByPartnerKey: '',
      claimedAt: '',
      claimExpiresAt: '',
    },
    partnerToNotify,
  };
}

/**
 * Row-level visibility (C5 §5): a partner sees the open pool and their own claims, **never**
 * another partner's claim. Enforced again in the query/rules — this function is what the UI and
 * the callable agree on, not the security boundary by itself.
 */
export function isVisibleToPartner(
  prospect: ProspectModel, partnerKey: string, today = getTodayStr(),
): boolean {
  if (prospect.revokedAt.length > 0) return false;
  if (prospect.claimedByPartnerKey === partnerKey) return true;
  return isInPool(prospect, today);
}

/** The date an unconverted lead may be deleted — retention runs from the last contact (§7). */
export function retentionDueDate(lastContactAt: string): string {
  return addDuration(lastContactAt, { months: PROSPECT_RETENTION_MONTHS });
}

/** Statuses that keep a lead out of the pool for good — useful for list filters and counts. */
export const TERMINAL_STATUSES: readonly ProspectStatus[] = ['converted', 'withdrawn'];
