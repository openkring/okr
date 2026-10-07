import { staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

/**
 * The editable fields shared by an i18n default row (`I18nDefaultModel`) and a tenant override
 * (`I18nTenantOverrideModel`). Both models carry these fields, so one form and one suite serve both.
 */
export interface I18nEntryFormModel {
  module: string;
  key: string;
  de: string;
  en: string;
  fr: string;
  es: string;
  it: string;
  isHtml: boolean;
}

/** the five translation texts, in display order */
export const I18N_ENTRY_LANGUAGES = ['de', 'en', 'fr', 'es', 'it'] as const;
export type I18nEntryLanguage = typeof I18N_ENTRY_LANGUAGES[number];

/**
 * Firestore reads skip model defaults: a legacy row may lack a language field entirely.
 * Fill the gaps with '' so the suite's string checks never reject a row the user did not touch.
 */
export function normalizeI18nEntry<T extends Partial<I18nEntryFormModel>>(entry: T): T & I18nEntryFormModel {
  return {
    ...entry,
    module: entry.module ?? '',
    key: entry.key ?? '',
    de: entry.de ?? '',
    en: entry.en ?? '',
    fr: entry.fr ?? '',
    es: entry.es ?? '',
    it: entry.it ?? '',
    isHtml: entry.isHtml ?? false,
  };
}

/**
 * module + key are typed by the admin (e.g. `chat/feature` · `fields.reconnecting`); the five texts are prose.
 * Nothing is mandatory — the previous hand-built modal enforced no rules either.
 */
export const i18nEntryValidations = staticSuite((model: I18nEntryFormModel) => {

  stringValidations('module', model.module, LONG_NAME_LENGTH);
  stringValidations('key', model.key, LONG_NAME_LENGTH);
  stringValidations('de', model.de, DESCRIPTION_LENGTH);
  stringValidations('en', model.en, DESCRIPTION_LENGTH);
  stringValidations('fr', model.fr, DESCRIPTION_LENGTH);
  stringValidations('es', model.es, DESCRIPTION_LENGTH);
  stringValidations('it', model.it, DESCRIPTION_LENGTH);
});
