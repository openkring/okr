import { enforce, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { PageModel } from '@bk2/shared-models';
import { baseValidations, isArrayOfStrings, stringValidations } from '@bk2/shared-util-core';

export const pageValidations = staticSuite((model: PageModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  stringValidations('title', model.title, NAME_LENGTH);
  // meta: MetaTag[] = [];        // meta tags for SEO
  stringValidations('type', model.type, WORD_LENGTH);
  stringValidations('state', model.state, WORD_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  // sections: string[] = []; // section.bkey, section.name

  test('sections', '@sectionsTypeStringArray', () => {
    enforce(isArrayOfStrings(model.sections)).isTruthy();
  });
});


