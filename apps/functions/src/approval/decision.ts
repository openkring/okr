// apps/functions/src/approval/decision.ts
//
// The fields one decision writes (spec 1.88 §4.2). `decidedBy` is who CALLED decideApproval —
// the snapshotted approver or an admin deciding in their place; before 1.88 only the
// approver was stored, so an admin's decision read as the approver's.
import { ApprovalState, AvatarInfo } from '@okr/shared-models';

export function buildDecisionPatch(
  state: ApprovalState, note: string, decidedBy: AvatarInfo | undefined, now: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { state, decisionDate: now, decisionNote: note };
  if (decidedBy?.key) patch['decidedBy'] = decidedBy;
  return patch;
}
