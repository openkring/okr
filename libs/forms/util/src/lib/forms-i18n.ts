import { Signal } from '@angular/core';

const PFX = '@forms/feature.';

// ---------------------------------------------------------------------------
// form-definition.store
// ---------------------------------------------------------------------------

export const FORM_I18N_KEYS = {
  list_title:   PFX + 'list.title',
  list_empty:   PFX + 'list.empty',
  archive_conf: PFX + 'delete.conf',
} satisfies Record<string, string>;

export type FormI18n = { [K in keyof typeof FORM_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// form-section (FormSectionStore)
// ---------------------------------------------------------------------------

export const FORM_SECTION_I18N_KEYS = {
  submit:       PFX + 'section.submit',
  submit_conf:  PFX + 'section.submit_conf',
  submit_error: PFX + 'section.submit_error',
  loading:      PFX + 'section.loading',
  not_found:    PFX + 'section.not_found',
  archived:     PFX + 'section.archived',
} satisfies Record<string, string>;

export type FormSectionI18n = { [K in keyof typeof FORM_SECTION_I18N_KEYS]: Signal<string> };
