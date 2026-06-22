import { Signal } from '@angular/core';

const PFX = '@aoc/feature.';

// ─── AocAdminOps ─────────────────────────────────────────────────────────────

export const AOC_I18N_KEYS = {
  title:                                  PFX + 'title',
  result_title:                           PFX + 'result.title',

  // account
  account_title:                          PFX + 'account.title',
  account_plural:                         PFX + 'account.plural',
  account_empty:                          PFX + 'account.empty',

  account_user_delete:                    PFX + 'account.user.delete.label',
  account_user_delete_confirm:            PFX + 'account.user.delete.confirm',
  account_user_delete_conf:                PFX + 'account.user.delete.conf',
  account_user_delete_error:              PFX + 'account.user.delete.error',

  account_user_update:                    PFX + 'account.user.update.label',
  account_user_conf:                      PFX + 'account.user.update.conf',
  account_user_error:                     PFX + 'account.user.update.error',

  account_fbuser_delete:                  PFX + 'account.fbuser.delete.label',
  account_fbuser_delete_confirm:          PFX + 'account.fbuser.delete.confirm',
  account_fbuser_delete_conf:             PFX + 'account.fbuser.delete.conf',
  account_fbuser_delete_error:            PFX + 'account.fbuser.delete.error',

  account_login_email:                    PFX + 'account.email.label',
  account_login_email_placeholder:        PFX + 'account.email.placeholder',
  account_membership_edit:                PFX + 'account.membership.edit',

  account_copy_email:                     PFX + 'account.copy.email',
  account_copy_uid:                       PFX + 'account.copy.uid',
  account_copy_pkey:                      PFX + 'account.copy.pkey',

  // adminops
  adminops_title:                         PFX + 'adminops.title',
  adminops_debug_tools:                   PFX + 'adminops.debug.tools',
  adminops_focus_event_logging:           PFX + 'adminops.debug.focus_event_logging',

  adminops_iban_title:                    PFX + 'adminops.iban.title',
  adminops_iban_label:                    PFX + 'adminops.iban.label',
  adminops_iban_button:                   PFX + 'adminops.iban.button',

  adminops_mcatchange_title:              PFX + 'adminops.mcatchange.title',
  adminops_mcatchange_button:              PFX + 'adminops.mcatchange.button',

  adminops_doubleMembers_title:           PFX + 'adminops.doubleMembers.title',
  adminops_doubleMembers_label:           PFX + 'adminops.doubleMembers.label',
  adminops_doubleMembers_button:          PFX + 'adminops.doubleMembers.button',

  adminops_oldjuniors_title:              PFX + 'adminops.oldJuniors.title',
  adminops_oldJuniors_label:              PFX + 'adminops.oldJuniors.label',
  adminops_oldJuniors_button:             PFX + 'adminops.oldJuniors.button',
  adminops_oldjuniors_nodob:              PFX + 'adminops.oldJuniors.nodob',
  adminops_oldjuniors_description:        PFX + 'adminops.oldJuniors.description',

  adminops_club_label:                    PFX + 'adminops.club.label',
  adminops_year_label:                    PFX + 'adminops.year.label',
  adminops_membership_prices_title:       PFX + 'adminops.membership.prices.title',
  adminops_membership_prices_label:       PFX + 'adminops.membership.prices.label',
  adminops_membership_prices_button:      PFX + 'adminops.membership.prices.button',
  adminops_membership_prices_description: PFX + 'adminops.membership.prices.description',

  adminops_membership_attributes_title:    PFX + 'adminops.membership.attributes.title',
  adminops_membership_attributes_label:    PFX + 'adminops.membership.attributes.label',
  adminops_membership_attributes_button:   PFX + 'adminops.membership.attributes.button',
  adminops_membership_attributes_description:  PFX + 'adminops.membership.attributes.description',

  adminops_checkJuniorEntry_title:         PFX + 'adminops.checkJuniorEntry.title',
  adminops_checkJuniorEntry_label:         PFX + 'adminops.checkJuniorEntry.label',
  adminops_checkJuniorEntry_button:        PFX + 'adminops.checkJuniorEntry.button',
  adminops_checkJuniorEntry_description:   PFX + 'adminops.checkJuniorEntry.description',

  // bexio
  bexio_title:                              PFX + 'bexio.title',

  bexio_invoices_title:                     PFX + 'bexio.invoices.title',
  bexio_invoices_subtitle:                  PFX + 'bexio.invoices.subtitle',
  bexio_invoices_nodata:                    PFX + 'bexio.invoices.nodata',
  bexio_invoices_status:                    PFX + 'bexio.invoices.status',
  bexio_invoices_history:                   PFX + 'bexio.invoices.history',

  bexio_bills_title:                        PFX + 'bexio.bills.title',
  bexio_bills_subtitle:                     PFX + 'bexio.bills.subtitle',
  bexio_bills_nodata:                       PFX + 'bexio.bills.nodata',
  bexio_bills_status:                       PFX + 'bexio.bills.status',
  bexio_bills_history:                      PFX + 'bexio.bills.history',

  bexio_journal_title:                      PFX + 'bexio.journal.title',
  bexio_journal_subtitle:                   PFX + 'bexio.journal.subtitle',
  bexio_journal_nodata:                     PFX + 'bexio.journal.nodata',
  bexio_journal_status:                     PFX + 'bexio.journal.status',
  bexio_journal_history:                    PFX + 'bexio.journal.history',

  bexio_accounts_title:                     PFX + 'bexio.accounts.title',
  bexio_accounts_subtitle:                  PFX + 'bexio.accounts.subtitle',
  bexio_accounts_nodata:                    PFX + 'bexio.accounts.nodata',
  bexio_accounts_download:                  PFX + 'bexio.accounts.download',
  bexio_accounts_history:                   PFX + 'bexio.accounts.history',

  bexio_index_title:                        PFX + 'bexio.index.title',
  bexio_index_content:                      PFX + 'bexio.index.content',
  bexio_index_button:                       PFX + 'bexio.index.button',
  bexio_index_contactFilter_label:          PFX + 'bexio.index.contactFilter.label',

  bexio_vendor_title:                       PFX + 'bexio.vendor.title',
  bexio_vendor_subtitle:                    PFX + 'bexio.vendor.subtitle',
  bexio_vendor_status_initial:              PFX + 'bexio.vendor.status.initial',
  bexio_vendor_status_done:                 PFX + 'bexio.vendor.status.done',
  bexio_vendor_status_open:                 PFX + 'bexio.vendor.status.open',
  bexio_vendor_status_linked:               PFX + 'bexio.vendor.status.linked',
  bexio_vendor_status_unmatched:            PFX + 'bexio.vendor.status.unmatched',

  bexio_receiver_title:                     PFX + 'bexio.receiver.title',
  bexio_receiver_status_initial:            PFX + 'bexio.receiver.status.initial',
  bexio_receiver_status_done:               PFX + 'bexio.receiver.status.done',
  bexio_receiver_status_open:               PFX + 'bexio.receiver.status.open',
  bexio_receiver_status_linked:             PFX + 'bexio.receiver.status.linked',
  bexio_receiver_status_unmatched:          PFX + 'bexio.receiver.status.unmatched',
  bexio_receiver_link:                      PFX + 'bexio.receiver.link',

  bexio_edit_person:                        PFX + 'bexio.edit.person',
  bexio_edit_org:                           PFX + 'bexio.edit.org',
  bexio_edit_membership:                    PFX + 'bexio.edit.membership',

  // chat
  chat_title:                               PFX + 'chat.title',
  chat_rooms:                               PFX + 'chat.rooms',
  chat_no_rooms:                            PFX + 'chat.no_rooms',
  chat_no_members:                          PFX + 'chat.no_members',
  chat_choose_room:                         PFX + 'chat.choose_room',
  chat_details:                             PFX + 'chat.details',
  chat_id:                                  PFX + 'chat.id',
  chat_name:                                PFX + 'chat.name',
  chat_created_by:                          PFX + 'chat.created_by',
  chat_members:                             PFX + 'chat.members',
  chat_note:                                PFX + 'chat.note',
  chat_invited:                             PFX + 'chat.invited',
  chat_public:                              PFX + 'chat.public',
  chat_topic:                               PFX + 'chat.topic',
  chat_aliases:                             PFX + 'chat.aliases',
  chat_avatar:                              PFX + 'chat.avatar',
  chat_uid:                                 PFX + 'chat.uid',
  chat_display_name:                        PFX + 'chat.display_name',
  chat_level:                               PFX + 'chat.level',
  chat_choose_room_or_member:               PFX + 'chat.choose_room_or_member',
  chat_select_roomMember:                   PFX + 'chat.select.roomMember.label',
  chat_select_roomMember_description:       PFX + 'chat.select.roomMember.description',

  chat_room_rename:                         PFX + 'chat.room.rename.label',
  chat_room_rename_newname:                 PFX + 'chat.room.rename.newname',
  chat_room_rename_action:                  PFX + 'chat.room.rename.action',
  chat_room_rename_conf:                    PFX + 'chat.room.rename.conf',

  chat_room_delete:                         PFX + 'chat.room.delete.label',
  chat_room_delete_confirm:                 PFX + 'chat.room.delete.confirm',
  chat_room_delete_action:                  PFX + 'chat.room.delete.action',
  chat_room_delete_conf:                    PFX + 'chat.room.delete.conf',

  chat_room_invite:                         PFX + 'chat.room.invite.label',
  chat_room_invite_action:                  PFX + 'chat.room.invite.action',
  chat_room_invite_conf:                    PFX + 'chat.room.invite.conf',

  chat_room_view:                           PFX + 'chat.room.view.label',

  chat_alias_add:                           PFX + 'chat.alias.add.label',
  chat_alias_add_placeholder:               PFX + 'chat.alias.add.placeholder',
  chat_alias_add_action:                    PFX + 'chat.alias.add.action',
  chat_alias_add_conf:                      PFX + 'chat.alias.add.conf',

  chat_user_provision:                      PFX + 'chat.user.provision.label',
  chat_user_provision_action:               PFX + 'chat.user.provision.action',
  chat_user_provision_conf:                 PFX + 'chat.user.provision.conf',

  chat_user_deactivate:                     PFX + 'chat.user.deactivate.label',
  chat_user_deactivate_confirm:             PFX + 'chat.user.deactivate.confirm',
  chat_user_deactivate_action:              PFX + 'chat.user.deactivate.action',
  chat_user_deactivate_conf:                PFX + 'chat.user.deactivate.conf',
  chat_user_deactivate_notfound:            PFX + 'chat.user.deactivate.notfound',

  chat_member_kick:                         PFX + 'chat.member.kick.label',
  chat_member_kick_confirm:                 PFX + 'chat.member.kick.confirm',
  chat_member_kick_action:                  PFX + 'chat.member.kick.action',
  chat_member_kick_conf:                    PFX + 'chat.member.kick.conf',

  chat_member_deactivate:                   PFX + 'chat.member.deactivate.label',
  chat_member_view:                         PFX + 'chat.member.view.label',

  // content
  content:                                  PFX + 'content.content',
  content_title:                            PFX + 'content.title',
  
  content_link_check_title:                 PFX + 'content.link.check.title',
  content_link_check_content:               PFX + 'content.link.check.content',
  content_link_check_show:                  PFX + 'content.link.check.show',
  content_link_check_hide:                  PFX + 'content.link.check.hide',

  content_section_delete:                   PFX + 'content.section.delete.label',
  content_section_delete_confirm:           PFX + 'content.section.delete.confirm',
  content_section_delete_conf:              PFX + 'content.section.delete.conf',
  content_section_delete_error:             PFX + 'content.section.delete.error',

  content_section_orphaned_title:           PFX + 'content.section.orphaned.title',
  content_section_orphaned_content:         PFX + 'content.section.orphaned.content',
  content_section_orphaned_hide:            PFX + 'content.section.orphaned.hide',
  content_section_orphaned_show:            PFX + 'content.section.orphaned.show',

  content_section_missing_title:            PFX + 'content.section.missing.title',
  content_section_missing_content:          PFX + 'content.section.missing.content',
  content_section_missing_hide:             PFX + 'content.section.missing.hide',
  content_section_missing_show:             PFX + 'content.section.missing.show',

  content_section_create:                   PFX + 'content.section.create',
  content_section_edit:                     PFX + 'content.section.edit',
  content_section_removeref:                PFX + 'content.section.removeRef',

  content_menu_delete:                      PFX + 'content.menu.delete.label',
  content_menu_delete_confirm:              PFX + 'content.menu.delete.confirm',
  content_menu_delete_conf:                 PFX + 'content.menu.delete.conf',
  content_menu_delete_error:                PFX + 'content.menu.delete.error',

  content_menu_create:                      PFX + 'content.menu.create',
  content_menu_edit:                        PFX + 'content.menu.edit',
  content_menu_removeref:                   PFX + 'content.menu.removeRef',

  content_menu_orphaned_title:              PFX + 'content.menu.orphaned.title',
  content_menu_orphaned_content:            PFX + 'content.menu.orphaned.content',
  content_menu_orphaned_hide:               PFX + 'content.menu.orphaned.hide',
  content_menu_orphaned_show:               PFX + 'content.menu.orphaned.show',

  content_menu_missing_title:               PFX + 'content.menu.missing.title',
  content_menu_missing_content:             PFX + 'content.menu.missing.content',
  content_menu_missing_hide:                PFX + 'content.menu.missing.hide',
  content_menu_missing_show:                PFX + 'content.menu.missing.show',

  content_copy_bkey:                        PFX + 'content.copy.bkey',
  content_page_edit:                        PFX + 'content.page.edit',

  // data
  data_title:                               PFX + 'data.title',
  data_content:                             PFX + 'data.content',

  data_check_console:                       PFX + 'data.check.console',

  data_fix_title:                           PFX + 'data.fix.title',
  data_fix_content:                         PFX + 'data.fix.content',
  data_fix_button:                          PFX + 'data.fix.button',

  data_validate_title:                      PFX + 'data.validate.title',
  data_validate_content:                    PFX + 'data.validate.content',
  data_validate_button:                     PFX + 'data.validate.button',
  data_validate_select:                     PFX + 'data.validate.select',

  data_index_title:                         PFX + 'data.index.title',
  data_index_content:                       PFX + 'data.index.content',
  data_index_button:                        PFX + 'data.index.button',
  data_index_select:                        PFX + 'data.index.select',

  data_fav_title:                           PFX + 'data.fav.title',
  data_fav_description:                     PFX + 'data.fav.description',
  data_fav_hide:                            PFX + 'data.fav.hide',
  data_fav_validate:                        PFX + 'data.fav.validate',
  data_fav_person:                          PFX + 'data.fav.person',
  data_fav_field:                           PFX + 'data.fav.field',
  data_fav_favperson:                       PFX + 'data.fav.favperson',
  data_fav_address:                         PFX + 'data.fav.address',
  data_fav_nomismatches:                    PFX + 'data.fav.nomismatches',

  // doc
  doc_title:                                PFX + 'doc.title',
  doc_content:                              PFX + 'doc.content',

  doc_copy_path:                            PFX + 'doc.copy.path',
  doc_copy_url:                             PFX + 'doc.copy.url',

  doc_create:                               PFX + 'doc.create.label',
  doc_create_conf:                          PFX + 'doc.create.conf',
  doc_create_error:                         PFX + 'doc.create.error',

  doc_delete:                               PFX + 'doc.delete.label',
  doc_delete_confirm:                       PFX + 'doc.delete.confirm',
  doc_delete_conf:                          PFX + 'doc.delete.conf',
  doc_delete_error:                         PFX + 'doc.delete.error',

  doc_hide:                                 PFX + 'doc.hide.label',
  doc_download:                             PFX + 'doc.download.label',

  doc_check_title:                          PFX + 'doc.check.title',
  doc_check_content:                        PFX + 'doc.check.content',
  doc_check_button:                         PFX + 'doc.check.button',

  // email


  // roles
  roles_title:                              PFX + 'roles.title',
  roles_person_select_title:                PFX + 'roles.personSelect.title',
  roles_person_select_content:              PFX + 'roles.personSelect.content',

  roles_account_select:                     PFX + 'roles.account.select',
  roles_account_title:                      PFX + 'roles.account.title',
  roles_account_content:                    PFX + 'roles.account.content',
  roles_account_button:                     PFX + 'roles.account.button',
  roles_account_pwd_set:                    PFX + 'roles.account.password.set',
  roles_account_pwd_reset:                  PFX + 'roles.account.password.reset',

  roles_assignment_title:                   PFX + 'roles.assignment.title',
  roles_assignment_content:                 PFX + 'roles.assignment.content',

  roles_check_title:                        PFX + 'roles.check.title',
  roles_check_content:                      PFX + 'roles.check.content',
  roles_check_button:                       PFX + 'roles.check.button',

  roles_fbuser_title:                       PFX + 'roles.fbuser.title',
  roles_fbuser_content:                     PFX + 'roles.fbuser.content',
  roles_fbuser_button:                      PFX + 'roles.fbuser.button',

  roles_impersonate_title:                  PFX + 'roles.impersonate.title',
  roles_impersonate_content:                PFX + 'roles.impersonate.content',
  roles_impersonate_button:                 PFX + 'roles.impersonate.button',

  roles_password_label:                     PFX + 'roles.password.label',
  roles_password_placeholder:               PFX + 'roles.password.placeholder',
  roles_password_error:                     PFX + 'roles.password.placeholder',
  roles_password_helper:                    PFX + 'roles.password.helper',
  roles_password_set:                       PFX + 'roles.password.set',
  roles_password_reset:                     PFX + 'roles.password.reset',

  // session

  // srv
  srv_title:                                PFX + 'srv.title',

  srv_index_title:                          PFX + 'srv.index.title',
  srv_index_subtitle:                       PFX + 'srv.index.subtitle',
  srv_index_reset:                          PFX + 'srv.index.reset',
  srv_index_button:                         PFX + 'srv.index.button',

  srv_person_update:                        PFX + 'srv.person.update.label',
  srv_membership_update:                    PFX + 'srv.membership.update.label',
  srv_parentmembership_update:              PFX + 'srv.membership.parent.update.label',
  srv_parentmembership_create:              PFX + 'srv.membership.parent.create.label',

  srv_regasoft_copy:                        PFX + 'srv.regasoft.copy.label',
  srv_regasoft_view:                        PFX + 'srv.regasoft.view.label',
  srv_regasoft_add:                         PFX + 'srv.regasoft.add.label',
  srv_regasoft_update:                      PFX + 'srv.regasoft.update.label',

  srv_license_create:                       PFX + 'srv.license.create.label',
  srv_license_download:                     PFX + 'srv.license.download.label',

  // statistics
  statistics_header:                        PFX + 'statistics.header',
  statistics_content:                       PFX + 'statistics.content',
  statistics_title:                         PFX + 'statistics.title',

  statistics_cl_title:                      PFX + 'statistics.competitionLevels.title',
  statistics_cl_label:                      PFX + 'statistics.competitionLevels.label',
  statistics_cl_conf:                       PFX + 'statistics.competitionLevels.conf',
  statistics_cl_button:                     PFX + 'statistics.competitionLevels.button',
  statistics_cl_description:                PFX + 'statistics.competitionLevels.description',

  statistics_cl_stats_title:                PFX + 'statistics.clStats.title',
  statistics_cl_stats_subtitle:             PFX + 'statistics.clStats.subTitle',
  statistics_cl_stats_label:                PFX + 'statistics.clStats.label',
  statistics_cl_stats_conf:                 PFX + 'statistics.clStats.conf',
  statistics_cl_stats_button:               PFX + 'statistics.clStats.button',

  statistics_age_by_gender_title:           PFX + 'statistics.ageByGender.title',
  statistics_age_by_gender_subtitle:        PFX + 'statistics.ageByGender.subTitle',
  statistics_age_by_gender_label:           PFX + 'statistics.ageByGender.label',
  statistics_age_by_gender_conf:            PFX + 'statistics.ageByGender.conf',
  statistics_age_by_gender_error:           PFX + 'statistics.ageByGender.error',
  statistics_age_by_gender_button:          PFX + 'statistics.ageByGender.button',

  statistics_cat_by_gender_title:           PFX + 'statistics.categoryByGender.title',
  statistics_cat_by_gender_subtitle:        PFX + 'statistics.categoryByGender.subTitle',
  statistics_cat_by_gender_label:           PFX + 'statistics.categoryByGender.label',
  statistics_cat_by_gender_conf:            PFX + 'statistics.categoryByGender.conf',
  statistics_cat_by_gender_button:          PFX + 'statistics.categoryByGender.button',

  statistics_member_location_title:         PFX + 'statistics.memberLocation.title',
  statistics_member_location_subtitle:      PFX + 'statistics.memberLocation.subTitle',
  statistics_member_location_label:         PFX + 'statistics.memberLocation.label',
  statistics_member_location_conf:          PFX + 'statistics.memberLocation.conf',
  statistics_member_location_button:        PFX + 'statistics.memberLocation.button',

  // storage
  storage_title:                            PFX + 'storage.title',
  storage_content:                          PFX + 'storage.content',

  storage_info_title:                       PFX + 'storage.info.title',
  storage_info_content:                     PFX + 'storage.info.content',
  storage_info_button_label:                PFX + 'storage.info.buttonLabel',

  storage_sizes_title:                      PFX + 'storage.sizes.title',
  storage_sizes_content:                    PFX + 'storage.sizes.content',
  storage_sizes_button_label:               PFX + 'storage.sizes.buttonLabel',

  // tag
  tag_title:                                PFX + 'tag.title',

  tag_add:                                  PFX + 'tag.add.label',
  tag_add_placeholder:                      PFX + 'tag.add.placeholder',
  tag_add_button:                           PFX + 'tag.add.button',
  tag_add_conf:                             PFX + 'tag.add.conf',
  tag_add_error:                            PFX + 'tag.add.error',

  tag_create:                               PFX + 'tag.create.label',
  tag_create_placeholder:                   PFX + 'tag.create.placeholder',
  tag_create_conf:                          PFX + 'tag.create.conf',
  tag_create_error:                         PFX + 'tag.create.error',

  tag_delete:                               PFX + 'tag.delete.label',
  tag_delete_confirm:                       PFX + 'tag.delete.confirm',
  tag_delete_conf:                          PFX + 'tag.delete.conf',
  tag_delete_error:                         PFX + 'tag.delete.error',

  tag_remove:                               PFX + 'tag.remove.label',
  tag_remove_conf:                          PFX + 'tag.remove.conf',
  tag_remove_error:                         PFX + 'tag.remove.error',

  tag_update:                               PFX + 'tag.update.label',
  tag_update_placeholder:                   PFX + 'tag.update.placeholder',
  tag_update_conf:                          PFX + 'tag.update.conf',
  tag_update_error:                         PFX + 'tag.update.error',

  tag_search:                               PFX + 'tag.search.label',
  tag_search_placeholder:                   PFX + 'tag.search.placeholder',

  tag_list_title:                           PFX + 'tag.list.title',
  tag_string_update:                        PFX + 'tag.string.update',
  tag_string_remove:                        PFX + 'tag.string.remove',
  tag_strings_title:                        PFX + 'tag.strings.title',
  tag_strings_empty:                        PFX + 'tag.strings.empty',

  // website
  website_title:                      PFX + 'website.title',
  website_key:                        PFX + 'website.key',
  website_is_html:                    PFX + 'website.isHtml',
  website_list_title:                 PFX + 'website.list.title',

  website_create_label:               PFX + 'website.create.label',
  website_create_conf:                PFX + 'website.create.conf',
  website_create_error:               PFX + 'website.create.error',
  
  website_delete_label:               PFX + 'website.delete.label',
  website_delete_confirm:             PFX + 'website.delete.confirm',
  website_delete_conf:                PFX + 'website.delete.conf',
  website_delete_error:               PFX + 'website.delete.error',

  website_update_label:               PFX + 'website.update.label',
  website_update_conf:                PFX + 'website.update.conf',
  website_update_error:               PFX + 'website.update.error',

  as_title:                           '@actionsheet.title',
  name:                               '@name.label',
  membership:                         '@membership',
  copy_conf:                          '@copy.conf',
  save:                               '@save.label',
  loading:                            '@loading',
  ok:                                 '@ok',
  cancel:                             '@cancel',
  error:                              '@error',
  search_placeholder:                 '@search.label',
} satisfies Record<string, string>;

export type AocI18n = { [K in keyof typeof AOC_I18N_KEYS]: Signal<string> };
