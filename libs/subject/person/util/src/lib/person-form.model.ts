import { PersonModel } from '@okr/shared-models';

/**
 * Form-side person model (spec 1.19 Phase 4, D9): the person edit/profile forms keep
 * their ssn/dob fields after `PersonModel` lost them in the Stage-C strip.
 * The values are hydrated from the addresses vault (owner/privileged: raw stream;
 * memberAdmin: getAddressView) and written back ONLY via
 * `PersonService.syncSensitiveChannels` — never onto the person document.
 */
export type PersonFormModel = PersonModel & {
  ssnId?: string;
  dateOfBirth?: string;
};
