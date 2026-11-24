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
  list_org_type: 'list_org_type',
  list_tags_org: 'list_tags_org',
  list_resource_type: 'list_resource_type',
  list_tags_resource: 'list_tags_resource',
  resource_other_note: 'resource_other_note',
  link_categories: 'link_categories',
  link_tags: 'link_tags',
  group_dashboard: 'group_dashboard',
  dashboard_intro: 'dashboard_intro',
  dashboard_badges: 'dashboard_badges',
  widget_draft: 'widget_draft',
  widget_off: 'widget_off',
  widget_off_button: 'widget_off_button',
  widget_only_here: 'widget_only_here',
  type_events: 'type_events',
  type_invitations: 'type_invitations',
  type_tasks: 'type_tasks',
  type_messages: 'type_messages',
  type_news: 'type_news',
  type_notices: 'type_notices',
  type_activities: 'type_activities',
  type_article: 'type_article',
  type_tiles: 'type_tiles',
  type_button: 'type_button',
  type_weather: 'type_weather',
  type_chat: 'type_chat',
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
