import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

/**
 * One entry of a tag definition, edited together with its per-tenant labels.
 * Not an OkrModel — the key lives in the `tags` document's comma-separated `tags` string and
 * the labels in an `i18nTenantOverride` row, so there is no `baseValidations` to run here.
 */
export interface TagStringFormData {
  key: string;
  de: string;
  en: string;
  fr: string;
  es: string;
  it: string;
}

export const tagStringValidations = staticSuite((model: TagStringFormData, field?: string) => {
  if (field) only(field);

  // the key is the only mandatory field — an empty language means "no override for that language"
  stringValidations('key', model.key, SHORT_NAME_LENGTH, 1, true);
  stringValidations('de', model.de, SHORT_NAME_LENGTH);
  stringValidations('en', model.en, SHORT_NAME_LENGTH);
  stringValidations('fr', model.fr, SHORT_NAME_LENGTH);
  stringValidations('es', model.es, SHORT_NAME_LENGTH);
  stringValidations('it', model.it, SHORT_NAME_LENGTH);
});
