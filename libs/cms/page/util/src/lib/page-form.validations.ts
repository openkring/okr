import { enforce, only, staticSuite, test} from 'vest';

import { categoryValidations, isArrayOfStrings, stringValidations } from '@bk2/shared/util';
import { DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { PageFormModel } from './page-form.model';
import { ContentState, PageType } from '@bk2/shared/models';


export const pageFormValidations = staticSuite((model: PageFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  //tenantValidations(model.tenants);

    stringValidations('title', model.title, NAME_LENGTH);
    // meta: MetaTag[] = [];        // meta tags for SEO
    categoryValidations('type', model.type, PageType);
    categoryValidations('state', model.state, ContentState);
    stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  test('sections', '@sectionsTypeStringArray', () => {
    enforce(isArrayOfStrings(model.sections)).isTruthy();
  });
});
