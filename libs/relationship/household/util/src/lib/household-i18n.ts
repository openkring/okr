import { Signal } from '@angular/core';

/** The households' strings live in the feature lib's scope (also the i18n scope of the `household_type` category list). */
const PFX = '@relationship/household/feature.';

export const HOUSEHOLD_I18N_KEYS = {
  household:                PFX + 'household',
  action_edit:              PFX + 'action.edit',
  title_new:                PFX + 'title.new',
  title_edit:               PFX + 'title.edit',
  cancel:                   PFX + 'cancel',
  save:                     PFX + 'save',

  name_label:               PFX + 'name.label',
  name_placeholder:         PFX + 'name.placeholder',
  name_helper:              PFX + 'name.helper',
  type_label:               PFX + 'type.label',
  members_label:            PFX + 'members.label',
  members_empty:            PFX + 'members.empty',
  member_add:               PFX + 'members.add',
  member_remove:            PFX + 'members.remove',
  payer_label:              PFX + 'payer.label',
  payer_helper:             PFX + 'payer.helper',
  payer_none:               PFX + 'payer.none',
  contact_label:            PFX + 'contact.label',
  contact_helper:           PFX + 'contact.helper',
  bundle_title:             PFX + 'bundle.title',
  bundle_post:              PFX + 'bundle.post',
  bundle_email:             PFX + 'bundle.email',
  bundle_inApp:             PFX + 'bundle.inApp',
  bundle_helper:            PFX + 'bundle.helper',

  save_conf:                PFX + 'saveResult.conf',
  save_error:               PFX + 'saveResult.error',
  no_household:             PFX + 'noHousehold',

  error_not_allowed:        PFX + 'error.notAllowed',
  error_tenants_changed:    PFX + 'error.tenantsChanged',
  error_members_changed:    PFX + 'error.membersChanged',
  error_field_not_allowed:  PFX + 'error.fieldNotAllowed',
  error_no_name:            PFX + 'error.noName',
  error_payer_not_member:   PFX + 'error.payerNotMember',
  error_contact_not_member: PFX + 'error.contactNotMember',
  error_duplicate_member:   PFX + 'error.duplicateMember',
  error_already_in_household: PFX + 'error.alreadyInHousehold',
  error_bad_tenants:        PFX + 'error.badTenants',
  error_empty_member:       PFX + 'error.emptyMember',
} satisfies Record<string, string>;

export type HouseholdI18n = { [K in keyof typeof HOUSEHOLD_I18N_KEYS]: Signal<string> };

/** Vest messages of the household suite: scoped keys, resolved by okr-error-note. */
export const HOUSEHOLD_VALIDATION_KEYS = {
  two_members:        PFX + 'validation.two_members',
  duplicate_member:   PFX + 'validation.duplicate_member',
  payer_not_member:   PFX + 'validation.payer_not_member',
  contact_required:   PFX + 'validation.contact_required',
  contact_not_member: PFX + 'validation.contact_not_member',
} as const;
