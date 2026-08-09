import {
  CategoryItemModel, CategoryListModel, TicketClassification, TicketModel, TicketSeverity,
  TicketStatus,
} from '@okr/shared-models';
import { addIndexElement, addWorkDays, getTodayStr, isType, redactSensitive } from '@okr/shared-util-core';

/**
 * The pure half of the 3LS escalation queue (spec C4), so the callables are only auth, reads and
 * writes and every rule below is testable without an emulator.
 *
 * Three things live here, and they are the three that cost money if they are wrong:
 *  - **the supported-version window** (§3) — a submission outside it is *rejected, not queued*;
 *  - **the required-field set** (§3) — an incomplete submission does not start the SLA clock;
 *  - **the two SLA legs** (§4) — workaround and released fix, tracked separately.
 *
 * Dates are `DateFormat.StoreDate` strings and are computed with the shared date utilities
 * (`addWorkDays`), never with `Date` arithmetic of our own (CLAUDE.md).
 */

/** Workaround leg: target 2 working days, 90 % (C2 §3 / C4 §4). */
export const WORKAROUND_WORK_DAYS = 2;
/** Released-fix leg: max 3 working days, in a minor release. */
export const FIX_WORK_DAYS = 3;
/** Retention tier of a ticket and its attachments — `LOG_24M` from `subject-data-map.ts` (§6.1). */
export const TICKET_RETENTION_MONTHS = 24;

/** The §3 required set. Absent any of them the submission is incomplete. */
export const REQUIRED_FIELDS = [
  'appVersion', 'firebaseProjectId', 'affectedTenantId', 'sentryEventUrl', 'reproSteps', 'platform',
] as const satisfies readonly (keyof TicketModel)[];

export interface SubmissionVerdict {
  ok: boolean;
  /** Required fields the partner left empty — shown back to them, not thrown. */
  missing: string[];
  /** Set when the version is outside the supported window: the ticket is refused outright. */
  rejectedReason?: string;
}

interface MinorVersion { major: number; minor: number }

function parseVersion(version: string): MinorVersion | undefined {
  const m = /^(\d+)\.(\d+)(?:\.\d+)?/.exec(version.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : undefined;
}

/**
 * Is the reporting installation inside the supported window — current + previous minor (C2 §5)?
 *
 * An unparseable version is NOT supported: "I could not read it" and "it is fine" must not be the
 * same answer at the one gate that keeps three-year-old installations out of the queue.
 */
export function isVersionSupported(reported: string, current: string): boolean {
  const r = parseVersion(reported);
  const c = parseVersion(current);
  if (!r || !c) return false;
  if (r.major === c.major) return r.minor === c.minor || r.minor === c.minor - 1;
  // ponytail: across a major bump we accept any minor of the previous major, because the last minor
  // number of that major is not derivable from `current` alone. Pass the real predecessor version
  // here if that ever matters — the rule stays "current + previous minor".
  return c.minor === 0 && r.major === c.major - 1;
}

/**
 * Validate a submission before it becomes a ticket.
 *
 * Version first: an out-of-window installation is refused whatever else it filled in, because
 * completing the form does not make an unsupported version supportable.
 */
export function validateSubmission(
  submission: Partial<TicketModel> | undefined, currentVersion: string,
): SubmissionVerdict {
  const missing = REQUIRED_FIELDS.filter((f) => String(submission?.[f] ?? '').trim().length === 0);
  const version = String(submission?.appVersion ?? '');
  if (version.length > 0 && !isVersionSupported(version, currentVersion)) {
    return {
      ok: false,
      missing,
      rejectedReason: `version ${version} is outside the supported window (current ${currentVersion} + previous minor)`,
    };
  }
  return { ok: missing.length === 0, missing };
}

/**
 * The two SLA deadlines. Both run from the moment the submission was *complete* — an incomplete one
 * never started the clock (§3), so passing the submission date of a form that was still missing its
 * repro steps would hand the partner time they did not earn.
 */
export function slaDeadlines(submittedAt: string): { workaroundDueAt: string; fixDueAt: string } {
  return {
    workaroundDueAt: addWorkDays(submittedAt, WORKAROUND_WORK_DAYS),
    fixDueAt: addWorkDays(submittedAt, FIX_WORK_DAYS),
  };
}

/**
 * Accept a validated submission into the queue: redact, stamp, start both clocks.
 *
 * `description` is redacted **here**, before the record exists — §6.1's rule is that the free text
 * is filtered server-side before it is written, not cleaned up afterwards. A ticket that was stored
 * raw for even one write has already leaked.
 */
export function acceptSubmission(ticket: TicketModel, today = getTodayStr()): TicketModel {
  return {
    ...ticket,
    description: redactSensitive(ticket.description) ?? '',
    // No attachment survives without an explicit redaction confirmation (§6.1, off by default).
    attachmentPaths: ticket.redactionConfirmed ? ticket.attachmentPaths : [],
    status: 'submitted',
    submittedAt: today,
    ...slaDeadlines(today),
  };
}

/** A refused submission is recorded, not dropped — §5 counts how often the window bites. */
export function rejectSubmission(ticket: TicketModel, reason: string, today = getTodayStr()): TicketModel {
  return { ...ticket, status: 'rejected', rejectedReason: reason, closedAt: today };
}

/** `defect` is a product fault and free; every other cause is the partner's and chargeable (§4). */
export function isChargeable(classification: TicketClassification): boolean {
  return classification === 'misconfiguration' || classification === 'how-to';
}

/**
 * Set or revise the classification. Always audited (who, when, why) because it drives both quota
 * consumption and billing, and re-classifiable on request (C2 §3) — so this overwrites rather than
 * refusing a second call, and the reason is mandatory.
 */
export function classifyTicket(
  ticket: TicketModel, classification: TicketClassification, reason: string, by: string,
  today = getTodayStr(),
): TicketModel | undefined {
  if (reason.trim().length === 0 || by.trim().length === 0) return undefined;
  return { ...ticket, classification, classificationReason: reason, classifiedBy: by, classifiedAt: today };
}

/**
 * Set the severity, i.e. decide whether the released-fix leg is owed at all (§8).
 *
 * A downgrade **clears `fixDueAt`**, which is what makes the field mean anything: `isSlaBreached`
 * already reads an empty `dueAt` as "not promised", so no second branch is needed anywhere. An
 * upgrade recomputes the deadline from `submittedAt` rather than from today — the partner reported
 * when they reported, and our triage delay is not theirs to absorb.
 *
 * The workaround leg is untouched in both directions: a workaround is owed whatever the severity.
 */
export function setSeverity(ticket: TicketModel, severity: TicketSeverity): TicketModel {
  const owed = severity === 'blocking' && ticket.submittedAt.length > 0;
  return { ...ticket, severity, fixDueAt: owed ? addWorkDays(ticket.submittedAt, FIX_WORK_DAYS) : '' };
}

/** Park a ticket on the partner — from here the clock stops for the §5 statistics. */
export function waitOnPartner(ticket: TicketModel, today = getTodayStr()): TicketModel {
  if (ticket.status === 'waiting-on-partner') return ticket;
  return { ...ticket, status: 'waiting-on-partner', waitingSince: today };
}

/**
 * Resume work, banking the waiting time.
 *
 * The interval is accumulated onto `waitingDays` instead of being derived later: after the second
 * round trip the boundaries are no longer recoverable from the record, and an un-banked interval
 * silently flatters our own resolution time.
 */
export function resumeFromPartner(ticket: TicketModel, today = getTodayStr()): TicketModel {
  if (ticket.status !== 'waiting-on-partner' || ticket.waitingSince.length === 0) return ticket;
  return {
    ...ticket,
    status: 'accepted',
    waitingDays: ticket.waitingDays + workDaysBetween(ticket.waitingSince, today),
    waitingSince: '',
  };
}

/**
 * Working days from `from` to `to`, inclusive of neither end — the unit both SLA legs are stated in
 * (§4), so resolution times and deadlines are measured on the same scale.
 */
export function workDaysBetween(from: string, to: string): number {
  if (from.length === 0 || to.length === 0 || from >= to) return 0;
  let days = 0;
  let cursor = from;
  // ponytail: step a day at a time; a ticket's lifetime is days, not years. Swap in a closed-form
  // count if this ever runs over a whole queue rather than one record.
  while (cursor < to) {
    cursor = addWorkDays(cursor, 1);
    if (cursor <= to) days++;
  }
  return days;
}

/**
 * Net working days to a milestone, with waiting-on-partner time excluded (§5).
 *
 * Returns `undefined` while the milestone has not been reached — 0 would look like "same day".
 */
export function netResolutionDays(ticket: TicketModel, milestone: 'workaroundAt' | 'fixedAt' | 'firstResponseAt'): number | undefined {
  const reached = ticket[milestone];
  if (reached.length === 0 || ticket.submittedAt.length === 0) return undefined;
  return Math.max(0, workDaysBetween(ticket.submittedAt, reached) - ticket.waitingDays);
}

/** Did a leg miss its deadline? Both are asked separately, because they are promised separately. */
export function isSlaBreached(ticket: TicketModel, leg: 'workaround' | 'fix', today = getTodayStr()): boolean {
  const [dueAt, reachedAt] = leg === 'workaround'
    ? [ticket.workaroundDueAt, ticket.workaroundAt]
    : [ticket.fixDueAt, ticket.fixedAt];
  if (dueAt.length === 0) return false;
  // Waiting time is ours to give back: a deadline is only blown once the partner's own delay is
  // subtracted, otherwise every ticket where we asked a question breaches by construction.
  const effectiveDue = ticket.waitingDays > 0 ? addWorkDays(dueAt, ticket.waitingDays) : dueAt;
  return (reachedAt.length > 0 ? reachedAt : today) > effectiveDue;
}

// ───────────────────────────── the UI's pure half (list + triage form) ──────────────────────────

/** Type guard for a ticket document, in the repo's existing `isType` idiom. */
export function isTicket(ticket: unknown, tenantId: string): ticket is TicketModel {
  return isType<TicketModel>(ticket, new TicketModel(tenantId));
}

/**
 * The search index.
 *
 * `sentryEventJson` and `description` are deliberately NOT indexed. They are the two fields §6.1
 * treats as contaminated-by-default, and an index field is readable by every member of the tenant
 * the record lives in — indexing them would route redacted free text straight back out through the
 * one field no privacy rule looks at.
 */
export function getTicketIndex(ticket: TicketModel): string {
  let index = addIndexElement('', 'name', ticket.name);
  index = addIndexElement(index, 'partner', ticket.partnerKey);
  index = addIndexElement(index, 'tenant', ticket.affectedTenantId);
  index = addIndexElement(index, 'version', ticket.appVersion);
  return index;
}

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'submitted', 'accepted', 'waiting-on-partner', 'resolved', 'closed', 'rejected',
];

export const TICKET_CLASSIFICATIONS: readonly TicketClassification[] = [
  'unclassified', 'defect', 'misconfiguration', 'how-to',
];

export const TICKET_SEVERITIES: readonly TicketSeverity[] = ['blocking', 'non-blocking'];

const STATUS_ICONS: Record<TicketStatus, string> = {
  submitted: 'send',
  accepted: 'checkmark',
  'waiting-on-partner': 'stop',
  resolved: 'bulb',
  closed: 'lock-closed',
  rejected: 'cancel',
};

const CLASSIFICATION_ICONS: Record<TicketClassification, string> = {
  unclassified: 'help-circle',
  defect: 'hammer',
  misconfiguration: 'settings',
  'how-to': 'chat',
};

const SEVERITY_ICONS: Record<TicketSeverity, string> = {
  blocking: 'alert-circle',
  'non-blocking': 'checkmark',
};

/**
 * The two audited pickers, built in code rather than read from the `categories` collection.
 *
 * Same reasoning as `partnerStatusCategory`, with more at stake: `TicketClassification` decides
 * whether an escalation is billed, and a per-tenant category document could drift out of the
 * compile-time union — which would let somebody store a classification `isChargeable` does not
 * know about, i.e. silently free.
 */
export function ticketClassificationCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = 'classification';
  category.i18n = '@business/ticket/util';
  category.translateItems = true;
  category.items = TICKET_CLASSIFICATIONS.map(c => new CategoryItemModel(c, CLASSIFICATION_ICONS[c]));
  return category;
}

/** The queue's status filter. Same build-in-code reasoning as the two pickers above. */
export function ticketStatusCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = 'status';
  category.i18n = '@business/ticket/util';
  category.translateItems = true;
  category.items = TICKET_STATUSES.map(s => new CategoryItemModel(s, STATUS_ICONS[s]));
  return category;
}

export function ticketSeverityCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = 'severity';
  category.i18n = '@business/ticket/util';
  category.translateItems = true;
  category.items = TICKET_SEVERITIES.map(s => new CategoryItemModel(s, SEVERITY_ICONS[s]));
  return category;
}

/**
 * §5's cause mix, for one partner's tickets or the whole queue.
 *
 * `rejected` submissions are counted separately rather than folded into a cause: a ticket refused
 * by the version window never had a cause established, and counting it as anything else would
 * make the honest measure of a partner's triage quality (§5) read worse or better than it is.
 */
export function causeMix(tickets: readonly TicketModel[]): Record<TicketClassification | 'rejected', number> {
  const mix: Record<TicketClassification | 'rejected', number> = {
    unclassified: 0, defect: 0, misconfiguration: 0, 'how-to': 0, rejected: 0,
  };
  for (const ticket of tickets) {
    if (ticket.status === 'rejected') mix.rejected++;
    else mix[ticket.classification]++;
  }
  return mix;
}
