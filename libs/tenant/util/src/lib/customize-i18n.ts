import { MODEL_FIELDS } from '@okr/shared-util-core';

/** Same scope prefix as `feature-picker-i18n.ts`: the lib's full path, `tenant/util.`. */
const PFX = '@tenant/util.customize.';

/** `resource.rboat` → `resource_rboat`, as in the key names of the JSON bundles. */
const flat = (modelKey: string): string => modelKey.replace(/\./g, '_');

export const customizeFieldKey = (modelKey: string, field: string): string => `field_${flat(modelKey)}_${field}`;
export const customizeGroupKey = (modelKey: string): string => `group_${flat(modelKey)}`;

const STATIC_KEYS = {
  intro: 'intro',
  reset: 'reset',
  reset_confirm: 'reset_confirm',
  lists_title: 'lists_title',
  lists_note: 'lists_note',
  list_gender: 'list_gender',
  list_address_channel: 'list_address_channel',
  list_address_usage: 'list_address_usage',
  list_tags_person: 'list_tags_person',
  link_categories: 'link_categories',
  link_tags: 'link_tags',
} as const;

const dynamicKeys: Record<string, string> = {};
for (const [modelKey, specs] of Object.entries(MODEL_FIELDS)) {
  dynamicKeys[customizeGroupKey(modelKey)] = customizeGroupKey(modelKey);
  for (const spec of specs) {
    const name = customizeFieldKey(modelKey, spec.field);
    dynamicKeys[name] = name;
  }
}

/** Static keys plus one group title per model and one label per `MODEL_FIELDS` entry; values are full scope keys. */
export const CUSTOMIZE_I18N_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries({ ...STATIC_KEYS, ...dynamicKeys }).map(([name, key]) => [name, PFX + key]),
);
