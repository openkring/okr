import { MeteringRecordModel, PartnerSegment } from '@okr/shared-models';
import { getDayDiff, getTodayStr } from '@okr/shared-util-core';

/**
 * The pure half of the metering ingest (C3 §6): what a valid payload is, what a record is called,
 * and when a partner has gone quiet. Kept out of the Cloud Function so it is testable without an
 * emulator — the function itself is then only auth, reads and writes.
 */

/** One tenant's line in a partner's monthly push. Mirrors C3 §4. */
export interface MeteringPayloadRow {
  tenantId: string;
  customerName: string;
  segment: PartnerSegment;
  totalUsers: number;
  privilegedUsers: number;
  addOns: string[];
  version: string;
  activationDate: string;
  contact: { name: string; role: string; email: string };
  /** Set when the tenant came from the shared prospect pool (C5 §7). */
  prospectKey?: string;
}

export interface MeteringPayload {
  partnerKey: string;
  /** `yyyy-mm` — the month being reported. */
  period: string;
  tenants: MeteringPayloadRow[];
}

const SEGMENTS: readonly PartnerSegment[] = ['club', 'alumni', 'steg', 'coop', 'kmu'];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RowRejection {
  tenantId: string;
  reason: string;
}

export interface PayloadVerdict {
  /** Rows that may be written. */
  accepted: MeteringPayloadRow[];
  /** Rows that may not, each with a reason the partner can act on. */
  rejected: RowRejection[];
  /** Set when the payload as a whole is unusable — nothing is written at all. */
  fatal?: string;
}

/**
 * Validate a pushed payload.
 *
 * **Per row, not all-or-nothing.** One malformed tenant must not cost a partner the whole month:
 * they would have to re-push everything, and the rows that were fine are exactly the rows whose
 * commission is not in dispute. Only a payload that is unusable as a whole (no partner, no period)
 * is fatal.
 *
 * Counts are trusted as given: they are computed by the partner's own installation under pricing
 * §9.1, by code bkaiser ships (C3 §2). What is checked here is that they are *numbers* — a NaN or a
 * negative count would otherwise flow straight into a band lookup and produce a real invoice.
 */
export function validatePayload(payload: Partial<MeteringPayload> | undefined): PayloadVerdict {
  const accepted: MeteringPayloadRow[] = [];
  const rejected: RowRejection[] = [];

  if (!payload?.partnerKey) return { accepted, rejected, fatal: 'partnerKey is required' };
  if (!payload.period || !PERIOD_RE.test(payload.period)) {
    return { accepted, rejected, fatal: 'period must be yyyy-mm' };
  }
  if (!Array.isArray(payload.tenants)) {
    return { accepted, rejected, fatal: 'tenants[] is required' };
  }

  const seen = new Set<string>();
  for (const row of payload.tenants) {
    const tenantId = String(row?.tenantId ?? '');
    if (tenantId.length === 0) {
      rejected.push({ tenantId: '', reason: 'tenantId is required' });
      continue;
    }
    // A partner reporting the same tenant twice in one push is a bug on their side, and silently
    // keeping the last one would make the month's total depend on array order.
    if (seen.has(tenantId)) {
      rejected.push({ tenantId, reason: 'duplicate tenantId in the same payload' });
      continue;
    }
    seen.add(tenantId);

    if (!isCount(row.totalUsers) || !isCount(row.privilegedUsers)) {
      rejected.push({ tenantId, reason: 'totalUsers and privilegedUsers must be non-negative integers' });
      continue;
    }
    if (row.privilegedUsers > row.totalUsers) {
      // Privileged accounts are a SUBSET of the total; the weighting doubles them on top. A row
      // where the subset exceeds the whole would inflate the band for free.
      rejected.push({ tenantId, reason: 'privilegedUsers cannot exceed totalUsers' });
      continue;
    }
    if (!SEGMENTS.includes(row.segment)) {
      rejected.push({ tenantId, reason: `segment must be one of ${SEGMENTS.join(', ')}` });
      continue;
    }
    accepted.push({ ...row, tenantId, addOns: Array.isArray(row.addOns) ? row.addOns : [] });
  }

  return { accepted, rejected };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * The document id of a metering record — and the idempotency key (C3 §6).
 *
 * A retried push writes the same id and overwrites its own row, so a retry storm cannot
 * double-count. Anything random would need a query-then-decide, which is the very race a retry
 * storm produces.
 */
export function meteringRecordId(partnerKey: string, tenantId: string, period: string): string {
  return `${partnerKey}_${tenantId}_${period}`;
}

/** Same key shape for the ledger, so a record and its commission entry line up by id. */
export function commissionEntryId(partnerKey: string, tenantId: string, period: string): string {
  return meteringRecordId(partnerKey, tenantId, period);
}

export function toMeteringRecord(
  row: MeteringPayloadRow, partnerKey: string, period: string, tenantId: string, receivedAt: string,
): MeteringRecordModel {
  const record = new MeteringRecordModel(tenantId);
  return Object.assign(record, {
    okey: meteringRecordId(partnerKey, row.tenantId, period),
    partnerKey,
    tenantId: row.tenantId,
    period,
    customerName: row.customerName ?? '',
    segment: row.segment,
    totalUsers: row.totalUsers,
    privilegedUsers: row.privilegedUsers,
    addOns: row.addOns ?? [],
    prospectKey: row.prospectKey ?? '',
    version: row.version ?? '',
    activationDate: row.activationDate ?? '',
    contact: {
      name: row.contact?.name ?? '',
      role: row.contact?.role ?? '',
      email: row.contact?.email ?? '',
    },
    receivedAt,
  });
}

/** C2 §13.3's escalation ladder on an absent heartbeat. */
export type HeartbeatStatus = 'ok' | 'notice' | 'termination-right';

export const HEARTBEAT_NOTICE_DAYS = 3;
export const HEARTBEAT_TERMINATION_DAYS = 14;

/**
 * How overdue a partner's reporting is (C2 §13.3): notice at 3 days, termination right at 14.
 *
 * A partner who has never pushed at all reports `ok`, not `termination-right`: silence before the
 * first push is onboarding, and starting the termination clock on a contract that has not begun
 * reporting yet would be indefensible. The clock starts at the first heartbeat.
 */
export function heartbeatStatus(lastHeartbeatAt: string, today = getTodayStr()): HeartbeatStatus {
  if (!lastHeartbeatAt) return 'ok';
  const days = getDayDiff(lastHeartbeatAt, today);
  if (days >= HEARTBEAT_TERMINATION_DAYS) return 'termination-right';
  if (days >= HEARTBEAT_NOTICE_DAYS) return 'notice';
  return 'ok';
}

/**
 * Tenants that were reported last period but are missing from this one (C3 §6's alert).
 *
 * A customer who churns is normal; a customer who *silently* disappears from the payload is the
 * shape of an under-report, and it is the only one bkaiser can detect at all from the outside.
 */
export function missingTenants(previous: readonly string[], current: readonly string[]): string[] {
  const now = new Set(current);
  return previous.filter(id => !now.has(id));
}

/**
 * `yyyy-mm` ± n months, without pulling a date library into a two-line calculation.
 *
 * Lives here rather than in the Cloud Function it was written for: the commission UI needs the
 * same arithmetic to offer periods, and two copies of a month shift is how one of them drifts.
 */
export function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const zero = year * 12 + (month - 1) + months;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, '0')}`;
}

/** The period a `yyyymmdd` store date falls in. */
export function periodOf(today = getTodayStr()): string {
  return `${today.slice(0, 4)}-${today.slice(4, 6)}`;
}

/**
 * The `count` most recent periods, newest first — the picker on the metering screen.
 *
 * Starts at the CURRENT month, not the last closed one: a partner may push mid-month (a retry, a
 * correction), and a picker that could not show the running month would make those invisible.
 */
export function recentPeriods(count = 12, today = getTodayStr()): string[] {
  const current = periodOf(today);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, -i));
}
