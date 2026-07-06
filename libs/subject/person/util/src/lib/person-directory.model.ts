import { PersonNewFormModel } from './person-new-form.model';

export interface PersonDirectoryResult {
  firstName: string;
  lastName: string;
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
  phone: string;
  email: string;
  web: string;
  occupation: string;
}

/**
 * Merge a directory result into a new-person form model.
 * Address/contact fields follow the same non-destructive rule as onZefixSelected
 * (`result || existing`): a present result value wins, an empty one keeps the
 * existing value. The occupation is appended to notes as a free-text hint.
 */
export function mergeDirectoryResultIntoForm(
  vm: PersonNewFormModel,
  d: PersonDirectoryResult
): PersonNewFormModel {
  return {
    ...vm,
    streetName: d.streetName || vm.streetName,
    streetNumber: d.streetNumber || vm.streetNumber,
    zipCode: d.zipCode || vm.zipCode,
    city: d.city || vm.city,
    countryCode: d.countryCode || vm.countryCode,
    phone: d.phone || vm.phone,
    email: d.email || vm.email,
    web: d.web || vm.web,
    notes: d.occupation ? [vm.notes, d.occupation].filter(Boolean).join('\n') : vm.notes,
  };
}
