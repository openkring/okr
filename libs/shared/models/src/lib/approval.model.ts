import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

/**
 * One person is asked a yes/no question about one record, the answer is remembered, and
 * the answer becomes an event again
 * (planning/specs/2026-08-15-approval-workflow-spec.md §3).
 *
 * Created by the `requestApproval` workflow action, decided through the `decideApproval`
 * callable. The collection is CF-write-only in firestore.rules: a decision a client could
 * write directly is not an audit trail.
 *
 * The approver is SNAPSHOTTED at request time rather than resolved when the decision is
 * made — a responsibility handover must not silently move a pending decision to someone
 * else. Reassigning is withdraw + re-request, which leaves a trace.
 */
export class ApprovalModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public kind = '';                          // the rule's actionArg, e.g. 'skiffPlatz' | 'payment'
  public subjectModelType = '';              // 'reservation' | 'expense' | 'application' | …
  public subjectKey = '';                    // '<modelType>.<okey>', prefixed per the parentKey convention
  public subjectName = '';                   // denormalised label for the list
  public requestedBy: AvatarInfo | undefined; // who caused the event; undefined for an anonymous one
  public approver: AvatarInfo | undefined;    // undefined = no second pair of eyes found, stalls unassigned
  public state: ApprovalState = 'pending';
  public decisionDate = '';                  // StoreDateTime
  public decisionNote = '';                  // mandatory on reject
  public ruleKey = '';                       // the workflow rule that asked — the audit trail
  public taskKey = '';                       // the task opened for the approver
  public writeBack = '';                     // 'collection.field' patched on decision, '' = none

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export const APPROVAL_STATE_VALUES: ApprovalState[] = ['pending', 'approved', 'rejected', 'withdrawn'];

export const ApprovalCollection = 'approvals';
export const ApprovalModelName = 'approval';

/** Max length of a decision note, enforced by the callable (same bound as reviewBooking's reason). */
export const MAX_DECISION_NOTE_LENGTH = 500;
