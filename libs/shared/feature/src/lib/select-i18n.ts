import { Signal } from '@angular/core';

const PFX = '@shared/feature.';

// ---------------------------------------------------------------------------
// calendar-select.store
// ---------------------------------------------------------------------------

export const CALENDAR_SELECT_I18N_KEYS = {
  calendar_select: PFX + 'calendar.select',
  calendar_empty:  PFX + 'calendar.empty',
} satisfies Record<string, string>;

export type CalendarSelectI18n = { [K in keyof typeof CALENDAR_SELECT_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// group-select.store
// ---------------------------------------------------------------------------

export const GROUP_SELECT_I18N_KEYS = {
  group_select: PFX + 'group.select',
  group_empty:  PFX + 'group.empty',
} satisfies Record<string, string>;

export type GroupSelectI18n = { [K in keyof typeof GROUP_SELECT_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// org-select.store
// ---------------------------------------------------------------------------

export const ORG_SELECT_I18N_KEYS = {
  org_select: PFX + 'org.select',
  org_empty:  PFX + 'org.empty',
} satisfies Record<string, string>;

export type OrgSelectI18n = { [K in keyof typeof ORG_SELECT_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// person-select.store
// ---------------------------------------------------------------------------

export const PERSON_SELECT_I18N_KEYS = {
  person_select: PFX + 'person.select',
  person_empty:  PFX + 'person.empty',
  select_label: '@select.label'
} satisfies Record<string, string>;

export type PersonSelectI18n = { [K in keyof typeof PERSON_SELECT_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// resource-select.store
// ---------------------------------------------------------------------------

export const RESOURCE_SELECT_I18N_KEYS = {
  resource_select: PFX + 'resource.select',
  resource_empty:  PFX + 'resource.empty',
} satisfies Record<string, string>;

export type ResourceSelectI18n = { [K in keyof typeof RESOURCE_SELECT_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// responsibility-select.store
// ---------------------------------------------------------------------------

export const RESPONSIBILITY_SELECT_I18N_KEYS = {
  responsibility_select: PFX + 'responsibility.select',
  responsibility_empty:  PFX + 'responsibility.empty',
} satisfies Record<string, string>;

export type ResponsibilitySelectI18n = { [K in keyof typeof RESPONSIBILITY_SELECT_I18N_KEYS]: Signal<string> };
