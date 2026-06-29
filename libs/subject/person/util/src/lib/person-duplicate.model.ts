/** Scalar person fields that can be reconciled between the new-person form and an existing person. */
export type ReconcilableField =
  | 'firstName'
  | 'lastName'
  | 'gender'
  | 'dateOfBirth'
  | 'dateOfDeath'
  | 'ssnId'
  | 'favEmail'
  | 'favPhone'
  | 'favZipCode';

/** A single field whose form value differs from the existing person's value. */
export interface PersonFieldDiff {
  field: ReconcilableField;
  existingValue: string;
  newValue: string;
}

/** Input to the findPersonDuplicates callable (only the candidate-matching fields). */
export interface FindPersonDuplicatesRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  favEmail: string;
  ssnId: string;
}

/** A matching person returned by findPersonDuplicates. No attribute is stripped (memberAdmin-gated). */
export interface PersonDuplicateCandidate {
  bkey: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  dateOfDeath: string;
  ssnId: string;
  favEmail: string;
  favPhone: string;
  favZipCode: string;
  bexioId: string;
  tenants: string[];
}

export interface FindPersonDuplicatesResponse {
  candidates: PersonDuplicateCandidate[];
}

/** Input to the mergePersonIntoTenant callable. */
export interface MergePersonIntoTenantRequest {
  personKey: string;
  tenantId: string;
  resolvedFields: Partial<Record<ReconcilableField, string>>;
}

export interface MergePersonIntoTenantResponse {
  bkey: string;
}
