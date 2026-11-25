import { ApplicationCollection, ApplicationModel, TaskModel, type AvatarInfo } from '@okr/shared-models';
import { getTaskIndex } from '@okr/project-task-util';
import { getApplicationIndex } from '@okr/application-util';

import { SYSTEM_AUTHOR } from '../workflow/activity';

export interface SubmissionRecordInput {
  /** the clean values `prepareSubmission` / `checkCourseChoice` decided on */
  values: Record<string, unknown>;
  /** mapping defaults — always win over the answers */
  defaults: Record<string, unknown> | undefined;
  collectionName: string;
  tenantId: string;
  submittedAt: string;
  formKey: string;
  /** empty = a genuine submission */
  spamReasons: string[];
}

/**
 * The document the generic collection write of `submitForm` stores (pure).
 *
 * - Never an `undefined` value: Firestore refuses the whole document (`ignoreUndefinedProperties` is
 *   not set), which lost every genuine application until 2026-11.
 * - `isArchived` and, for an application, `index` are written here: the lists query
 *   `isArchived == false`, and a document without the field matches no such query.
 * - Spam is stored with its reasons but archived, so nobody accepts it from the list by mistake; the
 *   form's CSV export still shows it.
 * - Server fields come last, so no answer can override them.
 */
export function buildSubmissionRecord(input: SubmissionRecordInput): Record<string, unknown> {
  const isSpam = input.spamReasons.length > 0;
  const record: Record<string, unknown> = {
    ...input.values,
    ...(input.defaults ?? {}),
    tenants: [input.tenantId],
    isArchived: isSpam,
    submittedAt: input.submittedAt,
    isSpam,
    ...(isSpam ? { spamReasons: input.spamReasons } : {}),
    formKey: input.formKey,
  };
  if (input.collectionName === ApplicationCollection) record['index'] = applicationIndex(record);
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

/** The same search index the app writes; an unanswered or non-text value counts as empty. */
function applicationIndex(record: Record<string, unknown>): string {
  const text = (key: string): string => (typeof record[key] === 'string' ? record[key] : '');
  return getApplicationIndex({
    firstName: text('firstName'),
    lastName: text('lastName'),
    zipCode: text('zipCode'),
    city: text('city'),
    applicationAs: text('applicationAs'),
    state: text('state'),
  } as ApplicationModel);
}

/**
 * The task a submission opens (pure): a full `TaskModel` document. A partial one breaks the assignee's
 * list — it splits `tags` as text, and the board has no column for a state outside `task_state`.
 */
export function buildSubmissionTask(input: {
  tenantId: string;
  formName: string;
  assignee: AvatarInfo;
  notes: string;
}): Record<string, unknown> {
  const task = new TaskModel(input.tenantId);
  task.name = `${input.formName} – Formulareinreichung`;
  task.author = SYSTEM_AUTHOR;
  task.assignee = input.assignee;
  task.notes = input.notes;
  task.tags = 'form.submission';
  task.index = getTaskIndex(task);
  const { okey, ...doc } = task;   // okey is the document id, never a field
  void okey;
  return doc;
}
