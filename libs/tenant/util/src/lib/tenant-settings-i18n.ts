import type { Signal } from '@angular/core';

import { SETTINGS_AUDIENCES, SETTINGS_GROUPS, type SettingsGroupId } from './tenant-settings';

/** Same scope prefix as `customize-i18n.ts`: the lib's full path, `tenant/util.`. */
const PFX = '@tenant/util.settings.';

export const SETTINGS_GROUP_IDS = Object.keys(SETTINGS_GROUPS) as SettingsGroupId[];

/**
 * The regional formats a tenant can choose. `app-config.locale` goes to the date and time pickers only, which take
 * any locale the browser knows; the list is one entry per app language, in the Swiss variant where there is one
 * (the same mapping as `calculator-format.ts`). 'de-ch' is what every tenant stores today.
 */
export const SETTINGS_LOCALES: readonly string[] = ['de-ch', 'fr-ch', 'it-ch', 'en', 'es'];

export const settingsGroupKey = (group: SettingsGroupId): string => `group_${group}`;
export const settingsFieldKey = (field: string): string => `field_${field}`;
export const settingsHelperKey = (field: string): string => `help_${field}`;
export const settingsAudienceKey = (audience: string): string => `audience_${audience}`;
export const settingsLocaleKey = (locale: string): string => `locale_${locale}`;

const STATIC_KEYS = {
  title: PFX + 'title',
  missing: PFX + 'missing',
  public_note: PFX + 'public_note',
  operator_only: PFX + 'operator_only',
  empty: PFX + 'empty',
  fallback: PFX + 'fallback',
  edit: PFX + 'edit',
  yes: PFX + 'yes',
  no: PFX + 'no',
  color_remove: PFX + 'color_remove',
  country_remove: PFX + 'country_remove',
  image_upload: PFX + 'image_upload',
  image_replace: PFX + 'image_replace',
  image_remove: PFX + 'image_remove',
  location_pick: PFX + 'location_pick',
  location_change: PFX + 'location_change',
  location_remove: PFX + 'location_remove',
  resource_pick: PFX + 'resource_pick',
  resource_change: PFX + 'resource_change',
  resource_remove: PFX + 'resource_remove',
  image_none: PFX + 'image_none',
  image_uploading: PFX + 'image_uploading',
  image_type_error: PFX + 'image_type_error',
  image_failed: PFX + 'image_failed',
  image_too_big: PFX + 'image_too_big',
  mail_domains: PFX + 'mail_domains',
  mail_domains_none: PFX + 'mail_domains_none',
  country_search: PFX + 'country_search',
  country_empty: PFX + 'country_empty',
  page_none: PFX + 'page_none',
  audience_title: PFX + 'audience.title',
  more_title: PFX + 'more.title',
  more_cookie: PFX + 'more.cookie.label',
  more_cookie_helper: PFX + 'more.cookie.helper',
  more_task_archive: PFX + 'more.task_archive.label',
  more_task_archive_helper: PFX + 'more.task_archive.helper',
  more_file_transfer: PFX + 'more.file_transfer.label',
  more_file_transfer_helper: PFX + 'more.file_transfer.helper',
  more_post: PFX + 'more.post.label',
  more_post_helper: PFX + 'more.post.helper',
  more_menu_rows: PFX + 'more.menu_rows.label',
  more_menu_rows_helper: PFX + 'more.menu_rows.helper',
  save: '@tenant/util.picker.save',
  cancel: '@tenant/util.picker.cancel',

  // value labels that exist already, next to the categories the profile settings use
  language_de: '@shared/categories.language.ge.label',
  language_en: '@shared/categories.language.en.label',
  language_fr: '@shared/categories.language.fr.label',
  language_es: '@shared/categories.language.es.label',
  language_it: '@shared/categories.language.it.label',
  avatarUsage_0: '@shared/categories.avatarUsage.none.label',
  avatarUsage_1: '@shared/categories.avatarUsage.gravatarFirst.label',
  avatarUsage_2: '@shared/categories.avatarUsage.noGravatar.label',
  avatarUsage_3: '@shared/categories.avatarUsage.photoFirst.label',
  nameDisplay_0: '@shared/categories.nameDisplay.firstLast.label',
  nameDisplay_1: '@shared/categories.nameDisplay.lastFirst.label',
  nameDisplay_2: '@shared/categories.nameDisplay.firstOnly.label',
  nameDisplay_3: '@shared/categories.nameDisplay.lastOnly.label',
  personSortCriteria_0: '@shared/categories.sortCriteria.firstname.label',
  personSortCriteria_1: '@shared/categories.sortCriteria.lastname.label',
  personSortCriteria_2: '@shared/categories.sortCriteria.fullname.label',
  personSortCriteria_3: '@shared/categories.sortCriteria.dob.label',
  personSortCriteria_4: '@shared/categories.sortCriteria.key.label',
  channel_post: '@shared/categories.delivery.post.label',
  channel_email: '@shared/categories.delivery.email.label',
  channel_chat: '@shared/categories.delivery.chat.label',
} as const;

const dynamicKeys: Record<string, string> = {};
for (const group of SETTINGS_GROUP_IDS) {
  dynamicKeys[settingsGroupKey(group)] = `${PFX}group.${group}`;
  for (const field of SETTINGS_GROUPS[group]) {
    dynamicKeys[settingsFieldKey(field)] = `${PFX}field.${field}.label`;
    dynamicKeys[settingsHelperKey(field)] = `${PFX}field.${field}.helper`;
  }
}
for (const audience of SETTINGS_AUDIENCES) dynamicKeys[settingsAudienceKey(audience)] = `${PFX}audience.${audience}`;
for (const locale of SETTINGS_LOCALES) dynamicKeys[settingsLocaleKey(locale)] = `${PFX}locale.${locale.replace('-', '_')}`;

/**
 * All texts of the settings page and its forms: the static ones, one title per group, one label and one helper per
 * field of every group, one label per audience and per locale. Values are full scope keys.
 */
export const SETTINGS_I18N_KEYS: Record<string, string> = { ...STATIC_KEYS, ...dynamicKeys };

/** The resolved texts, as `I18nService.translateAll(SETTINGS_I18N_KEYS)` returns them. */
export type SettingsI18n = Record<string, Signal<string>>;
