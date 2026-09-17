import { Signal } from '@angular/core';

const PFX = '@relationship/membership/feature.';

export const MEMBERSHIP_I18N_KEYS = {
  memberships:                    PFX + 'memberships',
  members:                        PFX + 'members',
  admin_marker:                   PFX + 'adminMarker',
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
  delete_group:                   PFX + 'delete.group',
  delete_confirm:                 PFX + 'delete.confirm',
  download_vcard:                 PFX + 'download.vcard',
  send_email:                     PFX + 'send.email',
  call_phone:                     PFX + 'call.phone',

  category_label:                 PFX + 'category.label.label',
  category_label_old:             PFX + 'category.label.old',
  category_label_new:             PFX + 'category.label.new',
  category_abbreviation:          PFX + 'category.abbreviation',
  category_helper:                PFX + 'category.helper',
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

  memberFee_archive_confirm:   PFX + 'memberFee.archive.confirm',
  memberFee_archive_conf:      PFX + 'memberFee.archive.conf',
  memberFee_delete_label:      PFX + 'memberFee.delete.label',
  memberFee_delete_confirm:    PFX + 'memberFee.delete.confirm',
  memberFee_delete_error:      PFX + 'memberFee.delete.error',
  memberFee_delete_conf:       PFX + 'memberFee.delete.conf',
  memberFee_generate_confirm:  PFX + 'memberFee.generate.confirm',
  memberFee_generate_conf:     PFX + 'memberFee.generate.conf',
  memberFee_update_label:      PFX + 'memberFee.update.label',
  memberFee_update_conf:       PFX + 'memberFee.update.conf',
  memberFee_download_enterInvoiceId:     PFX + 'memberFee.download.enterInvoiceId',
  memberFee_upload_label:      PFX + 'memberFee.upload.label',
  memberFee_upload_conf:       PFX + 'memberFee.upload.conf',
  memberFee_upload_noBexioId:  PFX + 'memberFee.upload.noBexioId',
  memberFee_invoice_conf:      PFX + 'memberFee.invoice.conf',
  memberFee_invoice_incomplete: PFX + 'memberFee.invoice.incomplete',
  memberFee_invoiceAll_label:  PFX + 'memberFee.invoiceAll.label',
  memberFee_invoiceAll_confirm: PFX + 'memberFee.invoiceAll.confirm',
  memberFee_invoiceAll_none:   PFX + 'memberFee.invoiceAll.none',
  memberFee_config_loading:    PFX + 'memberFee.config.loading',
  memberFee_totals_label:      PFX + 'memberFee.totals.label',
  memberFee_export_title:      PFX + 'memberFee.export.title',
  memberFee_list_title:        PFX + 'memberFee.list.title',
  memberFee_list_empty:        PFX + 'memberFee.list.empty',

  memberFee_jb:                PFX + 'memberFee.jb.label',
  memberFee_jb_placeholder:    PFX + 'memberFee.jb.placeholder',
  memberFee_jb_helper:         PFX + 'memberFee.jb.helper',

  memberFee_jbp:               PFX + 'memberFee.jbp.label',
  memberFee_jbp_placeholder:   PFX + 'memberFee.jbp.placeholder',
  memberFee_jbp_helper:        PFX + 'memberFee.jbp.helper',

  memberFee_bev:               PFX + 'memberFee.bev.label',
  memberFee_bev_placeholder:   PFX + 'memberFee.bev.placeholder',
  memberFee_bev_helper:        PFX + 'memberFee.bev.helper',

  memberFee_entryFee:          PFX + 'memberFee.entryFee.label',
  memberFee_entryFee_placeholder: PFX + 'memberFee.entryFee.placeholder',
  memberFee_entryFee_helper:   PFX + 'memberFee.entryFee.helper',

  memberFee_locker:            PFX + 'memberFee.locker.label',
  memberFee_locker_placeholder: PFX + 'memberFee.locker.placeholder',
  memberFee_locker_helper:     PFX + 'memberFee.locker.helper',

  memberFee_skiff:             PFX + 'memberFee.skiff.label',
  memberFee_skiff_placeholder: PFX + 'memberFee.skiff.placeholder',
  memberFee_skiff_helper:      PFX + 'memberFee.skiff.helper',

  memberFee_skiffInsurance:    PFX + 'memberFee.skiffInsurance.label',
  memberFee_skiffInsurance_placeholder:   PFX + 'memberFee.skiffInsurance.placeholder',
  memberFee_skiffInsurance_helper:PFX + 'memberFee.skiffInsurance.helper',

  memberFee_rebate:            PFX + 'memberFee.rebate.label',
  memberFee_total:             PFX + 'memberFee.total',

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
  // mcat: explicit
  key:                            '@key',
  select:                         '@select.label',
  search:                         '@search.label',
  as_title:                       '@actionsheet.title',
  name:                           '@name.label',
  phone:                          '@phone',
  email:                          '@email',
  ok:                             '@ok',
  cancel:                         '@cancel',
  count_label:                    PFX + 'count.label',
  save:                           '@save.label',

} satisfies Record<string, string>;

export type MembershipI18n = { [K in keyof typeof MEMBERSHIP_I18N_KEYS]: Signal<string> };

