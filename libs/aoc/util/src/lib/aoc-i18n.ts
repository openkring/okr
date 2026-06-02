import { Signal } from '@angular/core';

const PFX = '@aoc/feature.';

// ─── AocAdminOps ─────────────────────────────────────────────────────────────

export const AOC_ADMINOPS_I18N_KEYS = {
  title:               PFX + 'title',
  result_title:        PFX + 'result.title',
  adminops_title:      PFX + 'adminops.title',
  debug_tools:         PFX + 'adminops.debug.tools',
  focus_event_logging: PFX + 'adminops.debug.focus_event_logging',
  iban_title:          PFX + 'adminops.iban.title',
  iban_label:          PFX + 'adminops.iban.label',
  iban_button:         PFX + 'adminops.iban.button',
  mcatchange_title:    PFX + 'adminops.mcatchange.title',
  doubleMembers_title: PFX + 'adminops.doubleMembers.title',
  doubleMembers_label: PFX + 'adminops.doubleMembers.label',
  doubleMembers_button: PFX + 'adminops.doubleMembers.button',
  oldjuniors_title:    PFX + 'adminops.oldJuniors.title',
  oldJuniors_label:    PFX + 'adminops.oldJuniors.label',
  oldJuniors_button:   PFX + 'adminops.oldJuniors.button',
  oldjuniors_nodob:    PFX + 'adminops.oldJuniors.nodob',
  oldjuniors_description:    PFX + 'adminops.oldJuniors.description',
  club_label:          PFX + 'adminops.club.label',
  year_label:          PFX + 'adminops.year.label',
  membership_prices_title:        PFX + 'adminops.membership.prices.title',
  membership_prices_label:        PFX + 'adminops.membership.prices.label',
  membership_prices_button:       PFX + 'adminops.membership.prices.button',
  membership_prices_description:  PFX + 'adminops.membership.prices.description',
  membership_attributes_title:    PFX + 'adminops.membership.attributes.title',
  membership_attributes_label:    PFX + 'adminops.membership.attributes.label',
  membership_attributes_button:   PFX + 'adminops.membership.attributes.button',
  membership_attributes_description:  PFX + 'adminops.membership.attributes.description',
  checkJuniorEntry_title:         PFX + 'checkJuniorEntry.title',
  checkJuniorEntry_label:         PFX + 'checkJuniorEntry.label',
  checkJuniorEntry_button:        PFX + 'checkJuniorEntry.button',
  checkJuniorEntry_description:   PFX + 'checkJuniorEntry.description',
} satisfies Record<string, string>;

export type AocAdminopsI18n = { [K in keyof typeof AOC_ADMINOPS_I18N_KEYS]: Signal<string> };

// ─── AocBexio ─────────────────────────────────────────────────────────────────

export const AOC_BEXIO_I18N_KEYS = {
  title:                   PFX + 'bexio.title',
  invoices_title:          PFX + 'bexio.invoices.title',
  invoices_subtitle:       PFX + 'bexio.invoices.subtitle',
  loading:                 '@loading',
  invoices_nodata:         PFX + 'bexio.invoices.nodata',
  invoices_status:         PFX + 'bexio.invoices.status',
  invoices_history:        PFX + 'bexio.invoices.history',
  bills_title:             PFX + 'bexio.bills.title',
  bills_subtitle:          PFX + 'bexio.bills.subtitle',
  bills_nodata:            PFX + 'bexio.bills.nodata',
  bills_status:            PFX + 'bexio.bills.status',
  bills_history:           PFX + 'bexio.bills.history',
  journal_title:           PFX + 'bexio.journal.title',
  journal_subtitle:        PFX + 'bexio.journal.subtitle',
  journal_nodata:          PFX + 'bexio.journal.nodata',
  journal_status:          PFX + 'bexio.journal.status',
  journal_history:         PFX + 'bexio.journal.history',
  accounts_title:          PFX + 'bexio.accounts.title',
  accounts_subtitle:       PFX + 'bexio.accounts.subtitle',
  accounts_download:       PFX + 'bexio.accounts.download',
  accounts_history:        PFX + 'bexio.accounts.history',
  index_title:             PFX + 'bexio.index.title',
  index_content:           PFX + 'bexio.index.content',
  index_button:            PFX + 'bexio.index.button',
  index_contactFilter_label: PFX + 'bexio.index.contactFilter.label',
  vendor_title:            PFX + 'bexio.vendor.title',
  vendor_subtitle:         PFX + 'bexio.vendor.subtitle',
  vendor_status_initial:   PFX + 'bexio.vendor.status.initial',
  vendor_status_done:      PFX + 'bexio.vendor.status.done',
  vendor_status_open:      PFX + 'bexio.vendor.status.open',
  vendor_status_linked:    PFX + 'bexio.vendor.status.linked',
  vendor_status_unmatched: PFX + 'bexio.vendor.status.unmatched',
  receiver_title:          PFX + 'bexio.receiver.title',
  receiver_status_initial: PFX + 'bexio.receiver.status.initial',
  receiver_status_done:    PFX + 'bexio.receiver.status.done',
  receiver_status_open:    PFX + 'bexio.receiver.status.open',
  receiver_status_linked:  PFX + 'bexio.receiver.status.linked',
  receiver_link:           PFX + 'bexio.receiver.link',
} satisfies Record<string, string>;

export type AocBexioI18n = { [K in keyof typeof AOC_BEXIO_I18N_KEYS]: Signal<string> };

// ─── AocChat ──────────────────────────────────────────────────────────────────

export const AOC_CHAT_I18N_KEYS = {
  cancel:                       '@cancel',
  error:                        '@error',
  room_rename_header:           PFX + 'chat.room.rename.header',
  room_rename_newname:          PFX + 'chat.room.rename.newname',
  room_rename_action:           PFX + 'chat.room.rename.action',
  room_rename_conf:             PFX + 'chat.room.rename.conf',
  room_delete_header:           PFX + 'chat.room.delete.header',
  room_delete_action:           PFX + 'chat.room.delete.action',
  room_delete_conf:             PFX + 'chat.room.delete.conf',
  alias_add_header:             PFX + 'chat.alias.add.header',
  alias_add_placeholder:        PFX + 'chat.alias.add.placeholder',
  alias_add_action:             PFX + 'chat.alias.add.action',
  alias_add_conf:               PFX + 'chat.alias.add.conf',
  room_invite_header:           PFX + 'chat.room.invite.header',
  room_invite_action:           PFX + 'chat.room.invite.action',
  room_invite_conf:             PFX + 'chat.room.invite.conf',
  user_provision_header:        PFX + 'chat.user.provision.header',
  user_provision_action:        PFX + 'chat.user.provision.action',
  user_provision_conf:          PFX + 'chat.user.provision.conf',
  member_kick_header:           PFX + 'chat.member.kick.header',
  member_kick_action:           PFX + 'chat.member.kick.action',
  member_kick_conf:             PFX + 'chat.member.kick.conf',
  user_deactivate_header:       PFX + 'chat.user.deactivate.header',
  user_deactivate_action:       PFX + 'chat.user.deactivate.action',
  user_deactivate_conf:         PFX + 'chat.user.deactivate.conf',
  user_deactivate_notfound:     PFX + 'chat.user.deactivate.notfound',
} satisfies Record<string, string>;

export type AocChatI18n = { [K in keyof typeof AOC_CHAT_I18N_KEYS]: Signal<string> };

// ─── AocContent ───────────────────────────────────────────────────────────────

export const AOC_CONTENT_I18N_KEYS = {
  section_delete_confirm:    PFX + 'content.section.delete.confirm',
  menu_delete_conf:          PFX + 'content.menu.delete.conf',
  menu_delete_confirm:       PFX + 'content.menu.delete.confirm',
  ok:                        '@ok',
  cancel:                    '@cancel',
  title:                     PFX + 'content.title',
  result_title:              PFX + 'result.title',
  content:                   PFX + 'content.content',
  orphaned_sections_title:   PFX + 'content.orphanedSections.title',
  orphaned_sections_content: PFX + 'content.orphanedSections.content',
  orphaned_sections_hide:    PFX + 'content.orphanedSections.hide',
  orphaned_sections_show:    PFX + 'content.orphanedSections.show',
  missing_sections_title:    PFX + 'content.missingSections.title',
  missing_sections_content:  PFX + 'content.missingSections.content',
  missing_sections_hide:     PFX + 'content.missingSections.hide',
  missing_sections_show:     PFX + 'content.missingSections.show',
  orphaned_menus_title:      PFX + 'content.orphanedMenus.title',
  orphaned_menus_content:    PFX + 'content.orphanedMenus.content',
  orphaned_menus_hide:       PFX + 'content.orphanedMenus.hide',
  orphaned_menus_show:       PFX + 'content.orphanedMenus.show',
  missing_menus_title:       PFX + 'content.missingMenus.title',
  missing_menus_content:     PFX + 'content.missingMenus.content',
  missing_menus_hide:        PFX + 'content.missingMenus.hide',
  missing_menus_show:        PFX + 'content.missingMenus.show',
  check_links_title:         PFX + 'content.checkLinks.title',
  check_links_content:       PFX + 'content.checkLinks.content',
  check_links_show:          PFX + 'content.checkLinks.show',
  as_title:                  PFX + 'content.actionsheet.title',
  as_section_edit:           PFX + 'content.actionsheet.section.edit',
  as_section_delete:         PFX + 'content.actionsheet.section.delete',
  as_copy_bkey:              PFX + 'content.actionsheet.copy.bkey',
  as_page_edit:              PFX + 'content.actionsheet.page.edit',
  as_section_create:         PFX + 'content.actionsheet.section.create',
  as_section_removeref:      PFX + 'content.actionsheet.section.removeRef',
  as_menu_create:            PFX + 'content.actionsheet.menu.create',
  as_menu_delete:            PFX + 'content.actionsheet.menu.delete',
  as_menu_edit:              PFX + 'content.actionsheet.menu.edit',
  as_menu_removeref:         PFX + 'content.actionsheet.menu.removeRef',
} satisfies Record<string, string>;

export type AocContentI18n = { [K in keyof typeof AOC_CONTENT_I18N_KEYS]: Signal<string> };

// ─── AocData ──────────────────────────────────────────────────────────────────

export const AOC_DATA_I18N_KEYS = {
  check_console:    PFX + 'data.check.console',
  ok:               '@ok',
  cancel:           '@cancel',
  title:            PFX + 'data.title',
  content:          PFX + 'data.content',
  fix_title:        PFX + 'data.fix.title',
  fix_content:      PFX + 'data.fix.content',
  fix_button:       PFX + 'data.fix.button',
  validate_title:   PFX + 'data.validate.title',
  validate_content: PFX + 'data.validate.content',
  validate_button:  PFX + 'data.validate.button',
  index_title:      PFX + 'data.index.title',
  index_content:    PFX + 'data.index.content',
  index_button:     PFX + 'data.index.button',
  fav_title:        PFX + 'data.fav.title',
  fav_description:  PFX + 'data.fav.description',
  fav_hide:         PFX + 'data.fav.hide',
  fav_validate:     PFX + 'data.fav.validate',
  fav_person:       PFX + 'data.fav.person',
  fav_field:        PFX + 'data.fav.field',
  fav_favperson:    PFX + 'data.fav.favperson',
  fav_address:      PFX + 'data.fav.address',
  fav_nomismatches: PFX + 'data.fav.nomismatches',
} satisfies Record<string, string>;

export type AocDataI18n = { [K in keyof typeof AOC_DATA_I18N_KEYS]: Signal<string> };

// ─── AocDoc ───────────────────────────────────────────────────────────────────

export const AOC_DOC_I18N_KEYS = {
  delete_confirm: PFX + 'doc.delete.confirm',
  create_conf: PFX + 'doc.create.conf',
  create_error: PFX + 'doc.create.error',
  ok: '@ok',
  cancel: '@cancel',
} satisfies Record<string, string>;

export type AocDocI18n = { [K in keyof typeof AOC_DOC_I18N_KEYS]: Signal<string> };

// ─── AocRoles ─────────────────────────────────────────────────────────────────

export const AOC_ROLES_I18N_KEYS = {
  roles_title:           PFX + 'roles.title',
  person_select_title:   PFX + 'roles.personSelect.title',
  person_select_content: PFX + 'roles.personSelect.content',

  account_select:        PFX + 'roles.account.select',
  account_title:         PFX + 'roles.account.title',
  account_content:       PFX + 'roles.account.content',
  account_button:        PFX + 'roles.account.button',
  account_pwd_set:       PFX + 'roles.account.password-set',
  account_pwd_reset:     PFX + 'roles.account.password-reset',

  check_title:           PFX + 'roles.check.title',
  check_content:         PFX + 'roles.check.content',
  check_button:          PFX + 'roles.check.button',

  fbuser_title:          PFX + 'roles.fbuser.title',
  fbuser_content:        PFX + 'roles.fbuser.content',
  fbuser_button:         PFX + 'roles.fbuser.button',

  impersonate_title:     PFX + 'roles.impersonate.title',
  impersonate_content:   PFX + 'roles.impersonate.content',
  impersonate_button:    PFX + 'roles.impersonate.button',

  pwd_label:             PFX + 'password.label',
  pwd_placeholder:       PFX + 'password.placeholder',
  pwd_helper:            PFX + 'password.helper',
  pwd_set:               PFX + 'password.set',
  pwd_reset:             PFX + 'password.reset',
} satisfies Record<string, string>;

export type AocRolesI18n = { [K in keyof typeof AOC_ROLES_I18N_KEYS]: Signal<string> };

// ─── AocSrv ───────────────────────────────────────────────────────────────────

export const AOC_SRV_I18N_KEYS = {
  srv_title:                  '@aoc.srv.title',
  index_title:                '@aoc.srv.index.title',
  index_subtitle:             '@aoc.srv.index.subtitle',
  index_reset:                '@aoc.srv.index.reset',
  index_button:               '@aoc.srv.index.button',
  as_person_edit:             PFX + 'actionsheet.person.edit',
  as_membership_edit:         PFX + 'actionsheet.membership.edit',
  as_parentmembership_edit:   PFX + 'actionsheet.parentMembership.edit',
  as_parentmembership_create: PFX + 'actionsheet.parentMembership.create',
  as_regasoft_copy:           PFX + 'actionsheet.regasoft.copy',
  as_regasoft_view:           PFX + 'actionsheet.regasoft.view',
  as_regasoft_add:            PFX + 'actionsheet.regasoft.add',
  as_regasoft_update:         PFX + 'actionsheet.regasoft.update',
  as_license_create:          PFX + 'actionsheet.license.create',
  as_license_download:        PFX + 'actionsheet.license.download',
  cancel:                     '@cancel',
} satisfies Record<string, string>;

export type AocSrvI18n = { [K in keyof typeof AOC_SRV_I18N_KEYS]: Signal<string> };

// ─── AocStatistics ────────────────────────────────────────────────────────────

export const AOC_STATISTICS_I18N_KEYS = {
  age_by_gender_conf:       PFX + 'statistics.ageByGender.create.conf',
  age_by_gender_error:      PFX + 'statistics.ageByGender.create.error',
  statistics_header:        PFX + 'statistics.header',
  statistics_content:       PFX + 'statistics.content',
  statistics_title:         PFX + 'statistics.title',
  cl_label:                 PFX + 'statistics.competitionLevels.label',
  cl_button:                PFX + 'statistics.competitionLevels.button',
  cl_stats_label:           PFX + 'statistics.clStats.label',
  cl_stats_button:          PFX + 'statistics.clStats.button',
  age_by_gender_label:      PFX + 'statistics.ageByGender.label',
  age_by_gender_button:     PFX + 'statistics.ageByGender.button',
  cat_by_gender_label:      PFX + 'statistics.categoryByGender.label',
  cat_by_gender_button:     PFX + 'statistics.categoryByGender.button',
  member_location_label:    PFX + 'statistics.memberLocation.label',
  member_location_button:   PFX + 'statistics.memberLocation.button',
} satisfies Record<string, string>;

export type AocStatisticsI18n = { [K in keyof typeof AOC_STATISTICS_I18N_KEYS]: Signal<string> };

// ─── AocStorage ───────────────────────────────────────────────────────────────

export const AOC_STORAGE_I18N_KEYS = {
  title:              PFX + 'storage.title',
  info_title:         PFX + 'storage.info.title',
  info_content:       PFX + 'storage.info.content',
  info_button_label:  PFX + 'storage.info.buttonLabel',
  sizes_title:        PFX + 'storage.sizes.title',
  sizes_content:      PFX + 'storage.sizes.content',
  sizes_button_label: PFX + 'storage.sizes.buttonLabel',
} satisfies Record<string, string>;

export type AocStorageI18n = { [K in keyof typeof AOC_STORAGE_I18N_KEYS]: Signal<string> };

// ─── AocTag ───────────────────────────────────────────────────────────────────

export const AOC_TAG_I18N_KEYS = {
  add_header: PFX + 'tag.add.header',
  add_placeholder: PFX + 'tag.add.placeholder',
  add_button: PFX + 'tag.add.button',
  add_conf: PFX + 'tag.add.conf',
  add_error: PFX + 'tag.add.error',
  create_header: PFX + 'tag.create.header',
  create_placeholder: PFX + 'tag.create.placeholder',
  create_conf: PFX + 'tag.create.conf',
  create_error: PFX + 'tag.create.error',
  delete_conf: PFX + 'tag.delete.conf',
  delete_confirm: PFX + 'tag.delete.confirm',
  delete_error: PFX + 'tag.delete.error',
  edit_header: PFX + 'tag.edit.header',
  edit_placeholder: PFX + 'tag.edit.placeholder',
  edit_conf: PFX + 'tag.edit.conf',
  edit_error: PFX + 'tag.edit.error',
  remove_conf: PFX + 'tag.remove.conf',
  remove_error: PFX + 'tag.remove.error',
  update_conf: PFX + 'tag.update.conf',
  update_error: PFX + 'tag.update.error',
  search: PFX + 'tag.search.placeholder',
  ok: '@ok',
  cancel: '@cancel',
  title:             PFX + 'tag.title',
  list_title:        PFX + 'tag.list.title',
  loading:           '@general.operation.loading',
  strings_title:     PFX + 'tag.strings.title',
  string_add_button: PFX + 'tag.string.add.button',
  strings_empty:     PFX + 'tag.strings.empty',
  as_edit:          PFX + 'actionsheet.tag.edit',
  as_delete:        PFX + 'actionsheet.tag.delete',
  as_string_edit:   PFX + 'actionsheet.tag.string.edit',
  as_string_remove: PFX + 'actionsheet.tag.string.remove',
} satisfies Record<string, string>;

export type AocTagI18n = { [K in keyof typeof AOC_TAG_I18N_KEYS]: Signal<string> };

// ─── AocUserAccount ───────────────────────────────────────────────────────────

export const AOC_USER_ACCOUNT_I18N_KEYS = {
  user_delete_confirm: PFX + 'account.user.delete.confirm',
  fbuser_delete_confirm: PFX + 'account.fbuser.delete.confirm',
  ok: '@ok',
  cancel: '@cancel',
  account_plural:  '@account.plural',
  login_email:     '@user.field.loginEmail',
  name:            '@user.field.name',
  as_fbuser_delete:     PFX + 'actionsheet.fbuser.delete',
  as_user_edit:         PFX + 'actionsheet.user.edit',
  as_user_delete:       PFX + 'actionsheet.user.delete',
  as_membership_edit:   PFX + 'actionsheet.membership.edit',
  as_account_copyemail: PFX + 'actionsheet.account.copyemail',
  as_account_copyuid:   PFX + 'actionsheet.account.copyuid',
  as_account_copypkey:  PFX + 'actionsheet.account.copypkey',
} satisfies Record<string, string>;

export type AocUserAccountI18n = { [K in keyof typeof AOC_USER_ACCOUNT_I18N_KEYS]: Signal<string> };

// ─── AocWebsite ───────────────────────────────────────────────────────────────

export const AOC_WEBSITE_I18N_KEYS = {
  title:          PFX + 'website.title',
  key:            PFX + 'website.key',
  is_html:        PFX + 'website.isHtml',
  list_title:     PFX + 'website.list.title',
  edit:           PFX + 'website.edit',
  create_label:   PFX + 'website.create.label',
  create_conf:    PFX + 'website.create.conf',
  create_error:   PFX + 'website.create.error',
  update_label:   PFX + 'website.update.label',
  update_conf:    PFX + 'website.update.conf',
  update_error:   PFX + 'website.update.error',
  delete_label:   PFX + 'website.delete.label',
  delete_conf:    PFX + 'website.delete.conf',
  delete_error:   PFX + 'website.delete.error',
  delete_confirm: PFX + 'website.delete.confirm',
  as_title:       '@actionsheet.title',
  copy_conf:      '@copy.conf',
  save:           '@save.label',
  loading:        '@loading',
  ok:             '@ok',
  cancel:         '@cancel',
  search_placeholder: '@search.label',
} satisfies Record<string, string>;

export type AocWebsiteI18n = { [K in keyof typeof AOC_WEBSITE_I18N_KEYS]: Signal<string> };
