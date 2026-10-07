import { Signal } from '@angular/core';

/**
 * The translations live in the feature lib's bundle (libs/i18n/feature/src/i18n), so the
 * scope prefix mirrors that path — not this util lib's.
 */
const PFX = '@i18n/feature.';

export const I18N_ENTRY_I18N_KEYS = {
  module_label:       PFX + 'module.label',
  module_placeholder: PFX + 'module.placeholder',
  module_helper:      PFX + 'module.helper',
  key_label:          PFX + 'key.label',
  key_placeholder:    PFX + 'key.placeholder',
  key_helper:         PFX + 'key.helper',
  de_label:           PFX + 'lang.de.label',
  en_label:           PFX + 'lang.en.label',
  fr_label:           PFX + 'lang.fr.label',
  es_label:           PFX + 'lang.es.label',
  it_label:           PFX + 'lang.it.label',
  text_placeholder:   PFX + 'lang.placeholder',
  is_html_label:      PFX + 'isHtml.label',
  is_html_helper:     PFX + 'isHtml.helper',

  default_edit_title:  PFX + 'default.edit.title',
  override_edit_title: PFX + 'override.edit.title',

  cancel:             '@cancel',
  save:               '@save.label',
} satisfies Record<string, string>;

export type I18nEntryI18n = { [K in keyof typeof I18N_ENTRY_I18N_KEYS]: Signal<string> };
