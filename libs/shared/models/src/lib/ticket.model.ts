import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { NamedModel, OkrModel, SearchableModel, TaggedModel } from './base.model';

/**
 * Where an escalation stands. The two SLA legs of C4 §4 are separate *timestamps*, not statuses —
 * a ticket with a workaround is still open until the fix ships, and collapsing that into one state
 * would measure the easy half.
 */
export type TicketStatus = 'submitted' | 'accepted' | 'waiting-on-partner' | 'resolved' | 'closed' | 'rejected';

/**
 * The cause, which decides both quota consumption and billing (C4 §4).
 *
 * `defect` is free; everything else is chargeable. `unclassified` is the honest initial value: the
 * classification is set by bkaiser after triage and is **never inferred** from the submission, so
 * there has to be a state that says "nobody has judged this yet".
 */
export type TicketClassification = 'unclassified' | 'defect' | 'misconfiguration' | 'how-to';

/**
 * `tickets/{okey}` — one 3LS escalation from a partner, in tenant `kring` (spec C4).
 *
 * One queue at bkaiser; the partner's own 1LS/2LS system stays theirs and escalated tickets mirror
 * into this one. No federation.
 *
 * ⚠️ **This record is diagnostics, not data.** §6.1 fixes the format precisely because bkaiser has
 * no standing access to a partner installation and whatever a partner pastes in will eventually
 * contain their customers' personal data. Three properties hold it shut:
 *  - `refs[]` carries `okey` **ids, never contents** — the offending record is not shipped;
 *  - there is **no log-paste field**, because raw logs are where member data actually arrives;
 *  - `description` is passed through `redactSensitive` **server-side before it is written**, the
 *    same call the partner's own `beforeSend` gate already runs (`shared/util-angular/sentry.ts`).
 *    A second implementation would be a second place that can be wrong.
 *
 * Retention is `LOG_24M` (24 months), an existing tier in `subject-data-map.ts` — not a new one.
 */
export class TicketModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  /** One-line title of the escalation. */
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  /** `PartnerModel.okey` of the escalating partner — the join key of every statistic in §5. */
  public partnerKey = '';

  // --- §3 submission: the required set. A submission missing any of these is incomplete and does
  // --- NOT start the SLA clock (see `validateSubmission`).
  /** openkring version of the affected installation, e.g. `7.11.0`. */
  public appVersion = '';
  public firebaseProjectId = '';
  /** Tenant id **inside the partner's installation**, not a tenant of ours. */
  public affectedTenantId = '';
  /** Link to the partner's Sentry event — already scrubbed by the `beforeSend` gate we ship. */
  public sentryEventUrl = '';
  public reproSteps = '';
  /** Browser / platform / OS as reported by the partner. */
  public platform = '';

  // --- §6.1 diagnostic format.
  /** Where it happened — a feature block key. Replaces "I'll send you a screenshot". */
  public feature = '';
  public route = '';
  /** When it occurred, as a `DateFormat` store string — for finding it in the operations log. */
  public occurredAt = '';
  /** `okey` references only. Ids, never contents. */
  public refs: string[] = [];
  /** The exported Sentry event as JSON, verbatim — already redacted on the partner's side. */
  public sentryEventJson = '';
  /** Partner free text. Written **only** after `redactSensitive` has run over it, server-side. */
  public description = '';

  /**
   * Storage paths of attachments. **Off by default** (§6.1): a screenshot is the one place an
   * unredacted member list walks in, so `redactionConfirmed` must be explicitly set by the partner
   * before any path may be added, and the files inherit the ticket's retention.
   */
  public attachmentPaths: string[] = [];
  public redactionConfirmed = false;

  public status: TicketStatus = 'submitted';

  /**
   * Set by bkaiser after triage, with `classificationReason` shown on the ticket, and
   * re-classifiable on request (C2 §3). Because it drives billing it is an explicit, audited field:
   * who set it and when are part of the record, not of a log somewhere.
   */
  public classification: TicketClassification = 'unclassified';
  public classificationReason = '';
  public classifiedBy = '';
  public classifiedAt = '';

  // --- §4 SLA. Two legs tracked separately: workaround (2 working days, 90 %) and released fix
  // --- (3 working days, minor release).
  public submittedAt = '';
  public firstResponseAt = '';
  public workaroundDueAt = '';
  public workaroundAt = '';
  public fixDueAt = '';
  public fixedAt = '';
  /** The minor release that carried the fix — feeds the §5 version distribution. */
  public fixVersion = '';
  public closedAt = '';

  /**
   * Working days the ticket sat waiting on the partner, excluded from every resolution time in §5.
   * Accumulated on each leave of `waiting-on-partner` rather than derived, because the interval
   * boundaries are not recoverable from the record once the status has moved on twice.
   */
  public waitingDays = 0;
  public waitingSince = '';

  /**
   * A submission whose version is outside the supported window is **rejected, not queued** (§3) —
   * the enforcement point for the largest operational risk of self-hosting. The reason is kept so
   * the partner sees why, and so §5 can count how often it happens.
   */
  public rejectedReason = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TicketCollection = 'tickets';
export const TicketModelName = 'ticket';
