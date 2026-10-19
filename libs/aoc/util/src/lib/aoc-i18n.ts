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

  account_fbuser_create_conf:             PFX + 'account.fbuser.create.conf',
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

  // account — Benutzername admin tools (spec 1.71 §6b)
  account_login_id:                       PFX + 'account.loginId.label',
  account_open:                           PFX + 'account.open.label',
  account_open_created:                   PFX + 'account.open.created',
  account_open_created_login_id:          PFX + 'account.open.createdWithLoginId',
  account_open_exists:                    PFX + 'account.open.exists',
  account_open_no_email:                  PFX + 'account.open.noEmail',
  account_open_no_person:                 PFX + 'account.open.noPerson',
  account_open_error:                     PFX + 'account.open.error',
  account_reset:                          PFX + 'account.reset.label',
  account_reset_conf:                     PFX + 'account.reset.conf',
  account_reset_error:                    PFX + 'account.reset.error',
  account_login_id_change:                PFX + 'account.loginId.change.label',
  account_login_id_change_header:         PFX + 'account.loginId.change.header',
  account_login_id_change_signout:        PFX + 'account.loginId.change.signout',
  account_login_id_change_conf:           PFX + 'account.loginId.change.conf',
  account_login_id_change_invalid:        PFX + 'account.loginId.change.invalid',
  account_login_id_change_taken:          PFX + 'account.loginId.change.taken',
  account_login_id_change_error:          PFX + 'account.loginId.change.error',
  account_swap:                           PFX + 'account.swap.label',
  account_swap_confirm:                   PFX + 'account.swap.confirm',
  account_swap_minor:                     PFX + 'account.swap.minor',
  account_swap_no_holder:                 PFX + 'account.swap.noHolder',
  account_swap_no_login_id:               PFX + 'account.swap.noLoginId',
  account_swap_conf:                      PFX + 'account.swap.conf',
  account_swap_error:                     PFX + 'account.swap.error',

  // adminops
  adminops_title:                         PFX + 'adminops.title',
  adminops_iban_label:                    PFX + 'adminops.iban.label',
  adminops_iban_button:                   PFX + 'adminops.iban.button',

  adminops_hasaccount_title:              PFX + 'adminops.hasAccount.title',
  adminops_hasaccount_label:              PFX + 'adminops.hasAccount.label',
  adminops_hasaccount_button:             PFX + 'adminops.hasAccount.button',
  adminops_hasaccount_confirm:            PFX + 'adminops.hasAccount.confirm',
  adminops_hasaccount_conf:               PFX + 'adminops.hasAccount.conf',

  // data
  data_title:                               PFX + 'data.title',
  data_content:                             PFX + 'data.content',

  data_validate_title:                      PFX + 'data.validate.title',
  data_validate_content:                    PFX + 'data.validate.content',
  data_validate_button:                     PFX + 'data.validate.button',
  data_validate_select:                     PFX + 'data.validate.select',

  data_index_title:                         PFX + 'data.index.title',
  data_index_content:                       PFX + 'data.index.content',
  data_index_button:                        PFX + 'data.index.button',
  data_index_select:                        PFX + 'data.index.select',

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

  roles_privileged_title:                   PFX + 'roles.privileged.title',
  roles_privileged_content:                 PFX + 'roles.privileged.content',
  roles_privileged_filter:                  PFX + 'roles.privileged.filter',
  roles_privileged_all:                     PFX + 'roles.privileged.all',

  roles_password_label:                     PFX + 'roles.password.label',
  roles_password_placeholder:               PFX + 'roles.password.placeholder',
  roles_password_error:                     PFX + 'roles.password.placeholder',
  roles_password_helper:                    PFX + 'roles.password.helper',
  roles_password_set:                       PFX + 'roles.password.set',
  roles_password_reset:                     PFX + 'roles.password.reset',

  // session
  session_title:                          PFX + 'session.title',
  session_empty:                          PFX + 'session.empty',
  session_anonymous:                      PFX + 'session.anonymous',
  session_logged_in:                      PFX + 'session.loggedIn',
  session_col_user:                       PFX + 'session.col.user',
  session_col_browser:                    PFX + 'session.col.browser',
  session_col_os:                         PFX + 'session.col.os',
  session_col_started:                    PFX + 'session.col.started',
  session_col_duration:                   PFX + 'session.col.duration',
  session_col_status:                     PFX + 'session.col.status',
  session_status_all:                     PFX + 'session.status.all',
  session_status_active:                  PFX + 'session.status.active',
  session_status_stale:                   PFX + 'session.status.stale',
  session_status_orphaned:                PFX + 'session.status.orphaned',
  session_status_ended:                   PFX + 'session.status.ended',
  session_menu_export:                    PFX + 'session.menu.export',
  session_menu_statistics:                PFX + 'session.menu.statistics',
  session_menu_duration:                  PFX + 'session.menu.duration',
  session_as_title:                       PFX + 'session.as.title',
  session_view:                           PFX + 'session.view',
  session_edit_user:                      PFX + 'session.edit.user',
  session_edit_person:                    PFX + 'session.edit.person',
  session_hide_user:                      PFX + 'session.hide.user',
  session_hide_anonymous:                 PFX + 'session.hide.anonymous',
  session_export_empty:                   PFX + 'session.export.empty',
  session_export_conf:                    PFX + 'session.export.conf',
  session_detail_title:                   PFX + 'session.detail.title',
  session_stats_title:                    PFX + 'session.stats.title',
  session_stats_total:                    PFX + 'session.stats.total',
  session_stats_users:                    PFX + 'session.stats.users',
  session_stats_anonymous:                PFX + 'session.stats.anonymous',
  session_stats_avg_duration:             PFX + 'session.stats.avgDuration',
  session_stats_median_duration:          PFX + 'session.stats.medianDuration',
  session_stats_by_browser:               PFX + 'session.stats.byBrowser',
  session_stats_by_os:                    PFX + 'session.stats.byOs',
  session_duration_title:                 PFX + 'session.duration.title',
  session_duration_from:                  PFX + 'session.duration.from',
  session_duration_to:                    PFX + 'session.duration.to',

  // roles console
  roles_person:                             PFX + 'roles.person',
  roles_user:                               PFX + 'roles.user',
  roles_result:                             PFX + 'roles.result',
  close:                                    '@shared/ui.close',

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
  website_de_label:                   PFX + 'website.de.label',
  website_de_placeholder:             PFX + 'website.de.placeholder',
  website_en_label:                   PFX + 'website.en.label',
  website_en_placeholder:             PFX + 'website.en.placeholder',
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

  // ─── AocTenantAllocation (spec 1.47) ───────────────────────────────────────
  allocation_title:                       PFX + 'allocation.title',
  allocation_person_select_title:         PFX + 'allocation.personSelect.title',
  allocation_person_select_content:       PFX + 'allocation.personSelect.content',
  allocation_person_select_button:        PFX + 'allocation.personSelect.button',
  allocation_card_person:                 PFX + 'allocation.card.person',
  allocation_org_select_content:          PFX + 'allocation.orgSelect.content',
  allocation_org_select_button:           PFX + 'allocation.orgSelect.button',
  allocation_card_org:                    PFX + 'allocation.card.org',
  allocation_resource_select_content:     PFX + 'allocation.resourceSelect.content',
  allocation_resource_select_button:      PFX + 'allocation.resourceSelect.button',
  allocation_card_resource:               PFX + 'allocation.card.resource',
  allocation_column_current:              PFX + 'allocation.column.current',
  allocation_column_available:            PFX + 'allocation.column.available',
  allocation_column_empty:                PFX + 'allocation.column.empty',
  allocation_grant_title:                 PFX + 'allocation.grant.title',
  allocation_revoke_title:                PFX + 'allocation.revoke.title',
  allocation_topup_title:                 PFX + 'allocation.topup.title',
  allocation_topup_button:                PFX + 'allocation.topup.button',
  allocation_topup_nothing:               PFX + 'allocation.topup.nothing',
  allocation_block_always:                PFX + 'allocation.block.always',
  allocation_block_always_hint:           PFX + 'allocation.block.alwaysHint',
  allocation_block_contact:               PFX + 'allocation.block.contact',
  allocation_block_sensitive:             PFX + 'allocation.block.sensitive',
  allocation_block_avatar:                PFX + 'allocation.block.avatar',
  allocation_favorite_marker:             PFX + 'allocation.favoriteMarker',
  allocation_legal_note:                  PFX + 'allocation.legalNote',
  allocation_confirm_ok:                  PFX + 'allocation.confirm.ok',
  allocation_confirm_cancel:              PFX + 'allocation.confirm.cancel',
  allocation_result:                      PFX + 'allocation.result',
  allocation_conf:                        PFX + 'allocation.conf',
  allocation_error:                       PFX + 'allocation.error',
  allocation_own_tenant_hint:             PFX + 'allocation.ownTenantHint',
  allocation_account_title:               PFX + 'allocation.account.title',
  allocation_account_checkbox:            PFX + 'allocation.account.checkbox',
  allocation_account_hint:                PFX + 'allocation.account.hint',
  allocation_account_email_choice:        PFX + 'allocation.account.emailChoice',
  allocation_account_created:             PFX + 'allocation.account.created',
  allocation_account_createdWithLoginId:  PFX + 'allocation.account.createdWithLoginId',
  allocation_email_taken:                 PFX + 'allocation.email.taken',
  allocation_account_failed:              PFX + 'allocation.account.failed',
} satisfies Record<string, string>;

// ─── Tenant App-Switcher ─────────────────────────────────────────────────────
export const TENANT_SWITCHER_I18N_KEYS = {
  switcher_title:   PFX + 'switcher.title',
  switcher_tooltip: PFX + 'switcher.tooltip',
  switcher_current: PFX + 'switcher.current',
};

// ─── AocEmail ────────────────────────────────────────────────────────────────
export const AOC_EMAIL_I18N_KEYS = {
  email_title:              PFX + 'email.title',
  email_search_placeholder: PFX + 'email.searchPlaceholder',
  email_all_event_types:    PFX + 'email.allEventTypes',
  email_empty:              PFX + 'email.empty',
};

export type AocI18n = { [K in keyof typeof AOC_I18N_KEYS]: Signal<string> };

// `fill` now lives in @okr/shared-util-core so every domain can use it; re-exported
// here so the existing `import { fill } from '@okr/aoc-util'` call sites keep working.
export { fill } from '@okr/shared-util-core';
