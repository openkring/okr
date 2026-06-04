import { Signal } from '@angular/core';

const PFX = '@subject/application/feature.';

export const APPLICATION_I18N_KEYS = {
  list_title:               PFX + 'list.title',
  list_empty:               PFX + 'list.empty',
  list_no_person:           PFX + 'list.no_person',

  add_group:                PFX + 'add.group.label',
  add_group_conf:           PFX + 'add.group.conf',
  add_membership:           PFX + 'add.membership.label',
  add_membership_conf:      PFX + 'add.membership.conf',
  accept:                   PFX + 'accept.label',
  accept_confirm:           PFX + 'accept.confirm',
  accept_conf:              PFX + 'accept.conf',
  accept_error:             PFX + 'accept.error',
  delete_confirm:          PFX + 'delete.confirm',
  delete_conf:             PFX + 'delete.conf',
  delete_error:            PFX + 'delete.error',
  deny:                     PFX + 'edit.deny.label',
  deny_conf:                PFX + 'edit.deny.conf',
  deny_error:               PFX + 'edit.deny.error',
  deny_reason:              PFX + 'edit.deny.reason',
  send_confirmation_sent:   PFX + 'send.confirmation_sent',
  send_decision_sent:       PFX + 'send.decision_sent',
  send_error:               PFX + 'send.error',
  update_title:             PFX + 'update.title',
  update_save_label:        PFX + 'update.save.label',
  update_save_conf:         PFX + 'update.save.conf',
  update_save_error:        PFX + 'update.save.error',
  cancel:                  '@cancel',

  firstname:                PFX + 'field.firstname',
  lastname:                 PFX + 'field.lastname',
  gender:                   PFX + 'field.gender',
  date_of_birth:            PFX + 'field.date_of_birth',
  ssn:                      PFX + 'field.ssn',
  email:                    PFX + 'field.email',
  phone:                    PFX + 'field.phone',
  street_name:              PFX + 'field.streetname',
  street_number:            PFX + 'field.streetnumber',
  zip_code:                 PFX + 'field.zipcode',
  city:                     PFX + 'field.city',
  country_code:             PFX + 'field.countrycode',
  parent_first_name:        PFX + 'field.parent.firstname',
  parent_last_name:         PFX + 'field.parent.lastname',
  parent_email:             PFX + 'field.parent.email',
  parent_phone:             PFX + 'field.parent.phone',
  application:              PFX + 'field.application',
  state:                    PFX + 'field.state',
  submitted:                PFX + 'field.submitted',
  reviewed:                 PFX + 'field.reviewed',
  reviewer:                 PFX + 'field.reviewer',
  reason:                   PFX + 'field.reason',

  validation_email_required: PFX + 'validation.email_required',
  validation_phone_required: PFX + 'validation.phone_required',

  section_person:          PFX + 'section.person',
  section_contact:         PFX + 'section.contact',
  section_address:         PFX + 'section.address',
  section_parent:          PFX + 'section.parent',
  section_application:     PFX + 'section.application',

  kind_youth:              PFX + 'kind.youth',
  kind_adult:              PFX + 'kind.adult',
  kind_transfer:           PFX + 'kind.transfer',

  state_applied:           PFX + 'state.applied',
  state_reviewing:         PFX + 'state.reviewing',
  state_closed_approved:   PFX + 'state.closed_approved',
  state_closed_denied:     PFX + 'state.closed_denied',
  state_closed_cancelled:  PFX + 'state.closed_cancelled'
} satisfies Record<string, string>;

export type ApplicationI18n = { [K in keyof typeof APPLICATION_I18N_KEYS]: Signal<string> };
