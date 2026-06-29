import { PersonNewFormModel } from './person-new-form.model';
import { PersonDuplicateCandidate, PersonFieldDiff, ReconcilableField } from './person-duplicate.model';

/** Maps each reconcilable person field to the form field that supplies its new value. */
const FIELD_SOURCE: Record<ReconcilableField, keyof PersonNewFormModel> = {
  firstName: 'firstName',
  lastName: 'lastName',
  gender: 'gender',
  dateOfBirth: 'dateOfBirth',
  dateOfDeath: 'dateOfDeath',
  ssnId: 'ssnId',
  favEmail: 'email',
  favPhone: 'phone',
  favZipCode: 'zipCode',
};

/**
 * Compares an existing person against the new-person form input and returns one entry per field
 * whose form value is non-empty and differs (trimmed) from the existing value. Empty form values
 * are skipped so reconciliation never proposes wiping established data.
 */
export function computePersonFieldDiffs(
  existing: PersonDuplicateCandidate,
  form: PersonNewFormModel,
): PersonFieldDiff[] {
  const diffs: PersonFieldDiff[] = [];
  for (const field of Object.keys(FIELD_SOURCE) as ReconcilableField[]) {
    const newValue = String(form[FIELD_SOURCE[field]] ?? '').trim();
    const existingValue = String(existing[field] ?? '').trim();
    if (newValue.length > 0 && newValue !== existingValue) {
      diffs.push({ field, existingValue, newValue });
    }
  }
  return diffs;
}
