import { enforce, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { PageModel } from '@okr/shared-models';
import { baseValidations, isArrayOfStrings, stringValidations } from '@okr/shared-util-core';

/** Website abstract cap (design §5.2); the form binds the same constant. */
export const PAGE_ABSTRACT_LENGTH = 500;

export const pageValidations = staticSuite((model: PageModel, tenants: string, tags: string) => {
  baseValidations(model, tenants, tags);

  stringValidations('title', model.title, NAME_LENGTH);
  // meta: MetaTag[] = [];        // meta tags for SEO
  stringValidations('type', model.type);
  stringValidations('state', model.state);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  // website fields are optional and absent on legacy pages, so they are checked only when present
  test('abstract', 'tooLong', () => {
    enforce((model.abstract ?? '').length).lessThanOrEquals(PAGE_ABSTRACT_LENGTH);
  });
  test('bannerUrl', 'tooLong', () => {
    enforce((model.bannerUrl ?? '').length).lessThanOrEquals(URL_LENGTH);
  });
  test('bannerAltText', 'required', () => {
    if ((model.bannerUrl ?? '').trim().length > 0) enforce((model.bannerAltText ?? '').trim().length).greaterThan(0);
  });
  // sections: string[] = []; // section.okey, section.name

  test('sections', 'notArray', () => {
    enforce(isArrayOfStrings(model.sections)).isTruthy();
  });
});


