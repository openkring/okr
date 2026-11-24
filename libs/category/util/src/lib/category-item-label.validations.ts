import { staticSuite } from 'vest';

import { NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

/** The tenant's label of one category item, per language; stored as an `i18nTenantOverride` row. */
export interface CategoryItemLabel {
  de: string;
  en: string;
  fr: string;
  es: string;
  it: string;
}

export function newCategoryItemLabel(values: Partial<CategoryItemLabel> = {}): CategoryItemLabel {
  return { de: values.de ?? '', en: values.en ?? '', fr: values.fr ?? '', es: values.es ?? '', it: values.it ?? '' };
}

export const categoryItemLabelValidations = staticSuite((model: CategoryItemLabel) => {
  stringValidations('de', model.de, NAME_LENGTH);
  stringValidations('en', model.en, NAME_LENGTH);
  stringValidations('fr', model.fr, NAME_LENGTH);
  stringValidations('es', model.es, NAME_LENGTH);
  stringValidations('it', model.it, NAME_LENGTH);
});
