import { Signal } from '@angular/core';

const PFX = '@shared/feature.';

export const SHARED_FEATURE_I18N_KEYS = {
  calendar_select: PFX + 'calendar.select',
  calendar_empty:  PFX + 'calendar.empty',

  group_select: PFX + 'group.select',
  group_empty:  PFX + 'group.empty',

  org_select: PFX + 'org.select',
  org_empty:  PFX + 'org.empty',

  person_select: PFX + 'person.select',
  person_empty:  PFX + 'person.empty',
  person_custom_use: PFX + 'person.custom_use',
  person_label: '@select.label',

  resource_select: PFX + 'resource.select',
  resource_empty:  PFX + 'resource.empty',

  responsibility_select: PFX + 'responsibility.select',
  responsibility_empty:  PFX + 'responsibility.empty',

  location_select:        PFX + 'location.select',
  location_empty:         PFX + 'location.empty',
  location_custom_use:    PFX + 'location.custom_use',
  location_segment_list:  PFX + 'location.segment.list',
  location_segment_map:   PFX + 'location.segment.map',
  location_map_select:    PFX + 'location.map.select',
  location_map_copy_w3w:  PFX + 'location.map.copy_w3w',
  location_map_copied:    PFX + 'location.map.copied'

} satisfies Record<string, string>;
export type SharedFeatureI18n = { [K in keyof typeof SHARED_FEATURE_I18N_KEYS]: Signal<string> };

