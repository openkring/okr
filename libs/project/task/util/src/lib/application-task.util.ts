import { ApplicationKind, TaskModel } from '@okr/shared-models';

/**
 * The applicant an Anmeldung task was opened for. `submitForm` writes the task note as
 * `{"submissionId", "formKey", "values"}` (buildSubmissionTaskNotes); for a form targeting
 * `applications` the submissionId is the application's okey.
 */
export interface ApplicationTaskInfo {
  submissionId: string;
  formKey: string;
  firstName: string;
  lastName: string;
  /** StoreDate yyyyMMdd, '' when not given */
  dateOfBirth: string;
  applicationAs: ApplicationKind | '';
  email: string;
  phone: string;
  parentEmail: string;
  parentPhone: string;
}

/** tag the submission task carries (buildSubmissionTask) */
export const FORM_SUBMISSION_TAG = 'form.submission';

const APPLICATION_KINDS: ApplicationKind[] = ['youth', 'adult', 'transfer'];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/**
 * Reads the applicant from the note of a form-submission task (pure). Undefined for every other
 * task, for a note that is no submission payload, and for a submission without a name (a contact
 * form, not an Anmeldung).
 */
export function parseApplicationTask(task: Pick<TaskModel, 'notes' | 'tags'> | undefined): ApplicationTaskInfo | undefined {
  if (!task) return undefined;
  const tags = (task.tags ?? '').split(',').map((t) => t.trim());
  if (!tags.includes(FORM_SUBMISSION_TAG)) return undefined;
  const notes = (task.notes ?? '').trim();
  if (!notes.startsWith('{')) return undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(notes);
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as { submissionId?: unknown; formKey?: unknown; values?: unknown };
  const submissionId = str(p.submissionId);
  if (!submissionId || !p.values || typeof p.values !== 'object') return undefined;
  const v = p.values as Record<string, unknown>;
  const firstName = str(v['firstName']);
  const lastName = str(v['lastName']);
  if (!firstName && !lastName) return undefined;
  const kind = str(v['applicationAs']) as ApplicationKind;
  return {
    submissionId,
    formKey: str(p.formKey),
    firstName,
    lastName,
    dateOfBirth: str(v['dateOfBirth']),
    applicationAs: APPLICATION_KINDS.includes(kind) ? kind : '',
    email: str(v['email']),
    phone: str(v['phone']),
    parentEmail: str(v['parentEmail']),
    parentPhone: str(v['parentPhone']),
  };
}

/**
 * `mailto:` link of the answer to an applicant: to the applicant, CC the parent (youth), with a
 * prefilled subject and body. '' when there is no address at all; a parent-only address becomes the
 * recipient.
 */
export function applicationMailtoHref(info: ApplicationTaskInfo, subject: string, body: string): string {
  const to = info.email || info.parentEmail;
  if (!to) return '';
  const params: string[] = [];
  if (info.email && info.parentEmail && info.parentEmail.toLowerCase() !== info.email.toLowerCase()) {
    params.push('cc=' + encodeURIComponent(info.parentEmail));
  }
  if (subject) params.push('subject=' + encodeURIComponent(subject));
  if (body) params.push('body=' + encodeURIComponent(body));
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}${params.length ? '?' + params.join('&') : ''}`;
}

/** `tel:` link of the applicant (else the parent); spaces and separators dropped, a leading + kept. '' without a number. */
export function applicationTelHref(info: ApplicationTaskInfo): string {
  const raw = info.phone || info.parentPhone;
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return digits.replace(/\+/g, '').length > 0 ? `tel:${digits}` : '';
}
