import { Signal } from '@angular/core';

const PFX = '@relationship/membership/feature.';

export const MEMBERSHIP_I18N_KEYS = {
  memberships:                    PFX + 'memberships',
  members:                        PFX + 'members',
  reldesc1:                       PFX + 'reldesc1',
  reldesc2:                       PFX + 'reldesc2',
  new_desc:                       PFX + 'newDesc',
  title_rel:                      PFX + 'titleRel',
  year_entry:                     PFX + 'year.entry',
  year_exit:                      PFX + 'year.exit',
  empty:                          PFX + 'empty',
  no_data_members:                PFX + 'noData.members',
  no_data_memberships:            PFX + 'noData.memberships',

  view_label:                     PFX + 'view.label',
  update_label:                   PFX + 'update.label',
  chat_open:                      PFX + 'chat.open',
  copy_email_label:               PFX + 'copy.email.label',
  copy_email_conf:                PFX + 'copy.email.conf',
  copy_phone_label:               PFX + 'copy.phone.label',
  copy_phone_conf:                PFX + 'copy.phone.conf',
  create_member:                  PFX + 'create.member',
  create_alreadyMember:           PFX + 'create.alreadyMember',
  create_label:                   PFX + 'create.label',
  create_error:                   PFX + 'create.error',
  create_conf:                    PFX + 'create.conf',
  end_label:                      PFX + 'end.label',
  end_select:                     PFX + 'end.select',
  end_intro:                      PFX + 'end.intro',
  delete_label:                   PFX + 'delete.label',
  delete_confirm:                 PFX + 'delete.confirm',
  download_vcard:                 PFX + 'download.vcard',
  send_email:                     PFX + 'send.email',
  call_phone:                     PFX + 'call.phone',

  category_label:                 PFX + 'category.label.label',
  category_label_old:             PFX + 'category.label.old',
  category_label_new:             PFX + 'category.label.new',
  category_abbreviation:          PFX + 'category.abbreviation',
  category_helper:                PFX + 'category.helper',
  category_name:                  PFX + 'category.name',
  category_change_label:          PFX + 'category.change.label',
  category_change_helper:         PFX + 'category.change.helper',
  category_change_helper_date:    PFX + 'category.change.helperDate',

  invoice_create_label:           PFX + 'invoice.create.label',
  invoice_create_conf:            PFX + 'invoice.create.conf',
  invoice_update:                 PFX + 'invoice.update',
  invoice_upload:                 PFX + 'invoice.upload',
  invoice_download:               PFX + 'invoice.download',
  invoice_paid:                   PFX + 'invoice.paid',
  invoice_delete:                 PFX + 'invoice.delete',
  invoice_state:                  PFX + 'invoice.state',

  member_update:                  PFX + 'member.update',
  member_state_label:             PFX + 'member.state.label',
  member_state_helper:            PFX + 'member.state.label',

  scsMemberFee_archive_confirm:   PFX + 'scsMemberFee.archive.confirm',
  scsMemberFee_archive_conf:      PFX + 'scsMemberFee.archive.conf',
  scsMemberFee_delete_label:      PFX + 'scsMemberFee.delete.label',
  scsMemberFee_delete_confirm:    PFX + 'scsMemberFee.delete.confirm',
  scsMemberFee_delete_error:      PFX + 'scsMemberFee.delete.error',
  scsMemberFee_delete_conf:       PFX + 'scsMemberFee.delete.conf',
  scsMemberFee_generate_confirm:  PFX + 'scsMemberFee.generate.confirm',
  scsMemberFee_generate_conf:     PFX + 'scsMemberFee.generate.conf',
  scsMemberFee_update_label:      PFX + 'scsMemberFee.update.label',
  scsMemberFee_update_conf:       PFX + 'scsMemberFee.update.conf',
  scsMemberFee_download_enterInvoiceId:     PFX + 'scsMemberFee.download.enterInvoiceId',
  scsMemberFee_upload_label:      PFX + 'scsMemberFee.upload.label',
  scsMemberFee_upload_conf:       PFX + 'scsMemberFee.upload.conf',
  scsMemberFee_upload_noBexioId:  PFX + 'scsMemberFee.upload.noBexioId',
  scsMemberFee_totals_label:      PFX + 'scsMemberFee.totals.label',
  scsMemberFee_export_title:      PFX + 'scsMemberFee.export.title',
  scsMemberFee_list_title:        PFX + 'scsMemberFee.list.title',
  scsMemberFee_list_empty:        PFX + 'scsMemberFee.list.empty',

  scsMemberFee_jb:                PFX + 'scsMemberFee.jb.label',
  scsMemberFee_jb_placeholder:    PFX + 'scsMemberFee.jb.placeholder',
  scsMemberFee_jb_helper:         PFX + 'scsMemberFee.jb.helper',

  scsMemberFee_jbp:               PFX + 'scsMemberFee.jbp.label',
  scsMemberFee_jbp_placeholder:   PFX + 'scsMemberFee.jbp.placeholder',
  scsMemberFee_jbp_helper:        PFX + 'scsMemberFee.jbp.helper',

  scsMemberFee_bev:               PFX + 'scsMemberFee.bev.label',
  scsMemberFee_bev_placeholder:   PFX + 'scsMemberFee.bev.placeholder',
  scsMemberFee_bev_helper:        PFX + 'scsMemberFee.bev.helper',

  scsMemberFee_entryFee:          PFX + 'scsMemberFee.entryFee.label',
  scsMemberFee_entryFee_placeholder: PFX + 'scsMemberFee.entryFee.placeholder',
  scsMemberFee_entryFee_helper:   PFX + 'scsMemberFee.entryFee.helper',

  scsMemberFee_locker:            PFX + 'scsMemberFee.locker.label',
  scsMemberFee_locker_placeholder: PFX + 'scsMemberFee.locker.placeholder',
  scsMemberFee_locker_helper:     PFX + 'scsMemberFee.locker.helper',

  scsMemberFee_skiff:             PFX + 'scsMemberFee.skiff.label',
  scsMemberFee_skiff_placeholder: PFX + 'scsMemberFee.skiff.placeholder',
  scsMemberFee_skiff_helper:      PFX + 'scsMemberFee.skiff.helper',

  scsMemberFee_skiffInsurance:    PFX + 'scsMemberFee.skiffInsurance.label',
  scsMemberFee_skiffInsurance_placeholder:   PFX + 'scsMemberFee.skiffInsurance.placeholder',
  scsMemberFee_skiffInsurance_helper:PFX + 'scsMemberFee.skiffInsurance.helper',

  scsMemberFee_rebate:            PFX + 'scsMemberFee.rebate.label',
  scsMemberFee_total:             PFX + 'scsMemberFee.total',

  memberId_label:                 PFX + 'memberId.label',
  memberId_placeholder:           PFX + 'memberId.placeholder',
  memberId_error:                 PFX + 'memberId.error',
  memberId_helper:                PFX + 'memberId.helper',

  person_details:                 PFX + 'person.details',
  person_address:                 PFX + 'person.address',
  person_misc:                    PFX + 'person.misc',
  person_membership:              PFX + 'person.membership',
  person_update:                  PFX + 'person.update.label',
  person_view:                    PFX + 'person.view.label',

  firstname_label:                PFX + 'firstname.label',
  firstname_placeholder:          PFX + 'firstname.placeholder',
  firstname_helper:               PFX + 'firstname.helper',

  lastname_label:                 PFX + 'lastname.label',
  lastname_placeholder:           PFX + 'lastname.placeholder',
  lastname_helper:                PFX + 'lastname.helper',

  ssnId_label:                    PFX + 'ssnId.label',
  ssnId_placeholder:              PFX + 'ssnId.placeholder',
  ssnId_helper:                   PFX + 'ssnId.helper',
  ssnId_error:                    PFX + 'ssnId.error',

  bexioId_label:                  PFX + 'bexioId.label',
  bexioId_placeholder:            PFX + 'bexioId.placeholder',
  bexioId_helper:                 PFX + 'bexioId.helper',
  bexioId_error:                  PFX + 'bexioId.error',

  abbreviation_label:             PFX + 'abbreviation.label',
  abbreviation_placeholder:       PFX + 'abbreviation.placeholder',
  abbreviation_helper:            PFX + 'abbreviation.helper',

  nickName_label:                 PFX + 'nickName.label',
  nickName_placeholder:           PFX + 'nickName.placeholder',
  nickName_helper:                PFX + 'nickName.helper',

  org_function_label:             PFX + 'orgFunction.label',
  org_function_placeholder:       PFX + 'orgFunction.placeholder',
  org_function_helper:            PFX + 'orgFunction.helper',

  rebate_label:                   PFX + 'rebate.label',
  rebate_placeholder:             PFX + 'rebate.placeholder',
  rebate_helper:                  PFX + 'rebate.helper',
  rebate_reason:                  PFX + 'rebate.reason',

  notes_label:                    PFX + 'notes.label',
  notes_placeholder:              PFX + 'notes.placeholder',
  notes_helper:                   PFX + 'notes.helper',

  email_label:                    PFX + 'email.label',
  email_placeholder:              PFX + 'email.placeholder',

  phone_label:                    PFX + 'phone.label',
  phone_placeholder:              PFX + 'phone.placeholder',

  streetname_label:               PFX + 'streetname.label',
  streetname_placeholder:         PFX + 'streetname.placeholder',
  streetname_error:               PFX + 'streetname.error',
  streetname_helper:              PFX + 'streetname.helper',

  streetnumber_label:             PFX + 'streetnumber.label',
  streetnumber_placeholder:       PFX + 'streetnumber.placeholder',
  streetnumber_error:             PFX + 'streetnumber.error',
  streetnumber_helper:            PFX + 'streetnumber.helper',

  countrycode_label:              PFX + 'countrycode.label',
  countrycode_placeholder:        PFX + 'countrycode.placeholder',
  countrycode_error:              PFX + 'countrycode.error',
  countrycode_helper:             PFX + 'countrycode.helper',

  zipcode_label:                  PFX + 'zipcode.label',
  zipcode_placeholder:            PFX + 'zipcode.placeholder',
  zipcode_error:                  PFX + 'zipcode.error',
  zipcode_helper:                 PFX + 'zipcode.helper',

  city_label:                     PFX + 'city.label',
  city_placeholder:               PFX + 'city.placeholder',
  city_error:                     PFX + 'city.error',
  city_helper:                    PFX + 'city.helper',

  web_label:                      PFX + 'web.label',
  web_placeholder:                PFX + 'web.placeholder',
  web_helper:                     PFX + 'web.helper',
  web_error:                      PFX + 'web.error',

  dateOfEntry_label:              PFX + 'dateOfEntry.label',
  dateOfEntry_placeholder:        PFX + 'dateOfEntry.placeholder',
  dateOfEntry_helper:             PFX + 'dateOfEntry.helper',

  dateOfExit_label:               PFX + 'dateOfExit.label',
  dateOfExit_placeholder:         PFX + 'dateOfExit.placeholder',
  dateOfExit_helper:              PFX + 'dateOfExit.helper',

  dateOfChange_label:             PFX + 'dateOfChange.label',
  dateOfChange_placeholder:       PFX + 'dateOfChange.placeholder',
  dateOfChange_helper:            PFX + 'dateOfChange.helper',

  dateOfBirth_label:             PFX + 'dateOfBirth.label',
  dateOfBirth_placeholder:       PFX + 'dateOfBirth.placeholder',
  dateOfBirth_helper:            PFX + 'dateOfBirth.helper',

  dateOfDeath_label:             PFX + 'dateOfDeath.label',
  dateOfDeath_placeholder:       PFX + 'dateOfDeath.placeholder',
  dateOfDeath_helper:            PFX + 'dateOfDeath.helper',

  // mcat_scs: explicit
  // mcat_srv: explicit
  // mcat_default: explicit
  key:                            '@key',
  select:                         '@select.label',
  search:                         '@search.label',
  as_title:                       '@actionsheet.title',
  name:                           '@name.label',
  phone:                          '@phone',
  email:                          '@email',
  ok:                             '@ok',
  cancel:                         '@cancel',
  save:                           '@save.label',

} satisfies Record<string, string>;

export type MembershipI18n = { [K in keyof typeof MEMBERSHIP_I18N_KEYS]: Signal<string> };

