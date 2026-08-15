// apps/functions/src/approval/write-back.ts
//
// The outcome patch of a decided approval
// (planning/specs/2026-08-15-approval-workflow-spec.md §3.4a).
//
// A rule chooses WHETHER a field is patched. It can never choose which arbitrary field
// gets which arbitrary value — otherwise a workflow rule, editable by any tenant admin,
// becomes a write primitive over the whole database and bypasses firestore.rules.

/** The only (collection.field → value) pairs an approval may write. */
export const WRITE_BACK: Record<string, { approved: string; rejected: string }> = {
  // values verified 2026-08-15 against the live `reservation_state` category …
  'reservations.state': { approved: 'active', rejected: 'denied' },
  // … and against ApplicationState in shared-models.
  'applications.state': { approved: 'closed.approved', rejected: 'closed.denied' },
  // NB `expenses.status` is deliberately absent: ExpenseStatus is owned end-to-end by the
  // OCR→booking pipeline and a patch here would race reviewBooking.
};

export interface WriteBackTarget {
  collection: string;
  field: string;
  value: string;
}

/**
 * Resolve `writeBack` ('collection.field') + a decision into the patch to apply.
 * Returns undefined for an unlisted pair, an empty writeBack, or a non-deciding outcome
 * (`withdrawn` patches nothing).
 */
export function resolveWriteBack(writeBack: string, decision: string): WriteBackTarget | undefined {
  if (!writeBack) return undefined;
  const values = WRITE_BACK[writeBack];
  if (!values) return undefined;
  if (decision !== 'approved' && decision !== 'rejected') return undefined;

  const dot = writeBack.indexOf('.');
  return {
    collection: writeBack.slice(0, dot),
    field: writeBack.slice(dot + 1),
    value: values[decision],
  };
}
