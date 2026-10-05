import { ApprovalModel, ApprovalState } from '@okr/shared-models';
import { addIndexElement, ExportColumn } from '@okr/shared-util-core';

import { WorkflowI18n } from './workflow-i18n';

/*-------------------------- write-back --------------------------------*/
/**
 * The `collection.field` pairs an approval outcome may patch, offered as options in the
 * rule form. Mirrors the WRITE_BACK table in `apps/functions/src/approval/write-back.ts` —
 * a lib cannot import the functions app, so a new pair has to be added in both places.
 * The engine refuses anything not in ITS table, so a stale entry here fails closed.
 */
export const WRITE_BACK_OPTIONS = ['reservations.state', 'applications.state'];

/*-------------------------- state --------------------------------*/
/** A decision has been made; nothing more will happen to this approval. */
export function isDecided(approval: ApprovalModel): boolean {
  return (approval.state ?? 'pending') !== 'pending';
}

/**
 * An approval nobody can act on: it found no second pair of eyes at request time, so it
 * sits unassigned until an admin decides it (spec 2026-08-15 §3.2).
 */
export function isUnassigned(approval: ApprovalModel): boolean {
  return !approval.approver?.key && (approval.state ?? 'pending') === 'pending';
}

/*-------------------------- permissions --------------------------------*/
/** Mirrors decideApproval: the snapshotted approver or an admin, and only while pending. */
export function canDecideApproval(approval: ApprovalModel, myPersonKey: string, isAdmin: boolean): boolean {
  if ((approval.state ?? 'pending') !== 'pending') return false;
  return isAdmin || (!!myPersonKey && (approval.approver?.key ?? '') === myPersonKey);
}

/** Withdrawing is a cancellation: the requester may do it too. */
export function canWithdrawApproval(approval: ApprovalModel, myPersonKey: string, isAdmin: boolean): boolean {
  if ((approval.state ?? 'pending') !== 'pending') return false;
  return canDecideApproval(approval, myPersonKey, isAdmin) || (!!myPersonKey && (approval.requestedBy?.key ?? '') === myPersonKey);
}

/** Who decided — `decidedBy` since spec 1.88, the approver on older approvals. */
export function deciderName(approval: ApprovalModel): string {
  const a = approval.decidedBy ?? approval.approver;
  return `${a?.name1 ?? ''} ${a?.name2 ?? ''}`.trim();
}

/** Ionic colour per state, for the list badge. */
export function approvalStateColor(state: ApprovalState | string): string {
  switch (state) {
    case 'approved':  return 'success';
    case 'rejected':  return 'danger';
    case 'withdrawn': return 'medium';
    default:          return 'warning';   // pending — the one that wants attention
  }
}

/*-------------------------- search index --------------------------------*/
/**
 * Build the search index string for an ApprovalModel.
 * @param approval the approval to index
 */
export function getApprovalIndex(approval: ApprovalModel): string {
  let index = '';
  index = addIndexElement(index, 'k', approval.kind);
  index = addIndexElement(index, 's', approval.subjectName);
  index = addIndexElement(index, 't', approval.subjectKey);
  index = addIndexElement(index, 'a', approval.approver?.key ?? '');
  return index;
}

/** Returns a human-readable description of the index structure. */
export function getApprovalIndexInfo(): string {
  return 'k:ind s:ubject-name t:subject-key a:pprover';
}

/*-------------------------- display --------------------------------*/
/**
 * One-line summary shown as the list subtitle:
 * 'skiffPlatz · reservation · → Anna Muster'.
 * @param approval the approval to describe
 */
export function getApprovalSummary(approval: ApprovalModel): string {
  const approver = approval.approver?.key
    ? `→ ${`${approval.approver.name1 ?? ''} ${approval.approver.name2 ?? ''}`.trim()}`
    : '';
  return [approval.kind, approval.subjectModelType, approver]
    .filter((part) => part.length > 0)
    .join(' · ');
}

/*-------------------------- export --------------------------------*/
/**
 * Columns of the approval CSV export, in display order.
 * @param i18n the resolved workflow labels
 */
export function getApprovalExportColumns(i18n: WorkflowI18n): ExportColumn<ApprovalModel>[] {
  return [
    { header: i18n.approval_kind_label(),     value: (a) => a.kind ?? '' },
    { header: i18n.approval_subject_label(),  value: (a) => a.subjectName ?? '' },
    { header: i18n.approval_state_label(),    value: (a) => a.state ?? '' },
    { header: i18n.approval_approver_label(), value: (a) => `${a.approver?.name1 ?? ''} ${a.approver?.name2 ?? ''}`.trim() },
    { header: i18n.approval_decisionDate_label(), value: (a) => a.decisionDate ?? '' },
    { header: i18n.approval_note_label(),     value: (a) => a.decisionNote ?? '' },
  ];
}
