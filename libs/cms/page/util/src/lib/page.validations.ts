import { enforce, only, staticSuite, test} from 'vest';
import { ContentState, PageModel, PageType } from '@bk2/shared/models';
import { baseValidations, categoryValidations, isArrayOfStrings, stringValidations } from '@bk2/shared/util';
import { DESCRIPTION_LENGTH, NAME_LENGTH } from '@bk2/shared/config';

export const pageValidations = staticSuite((model: PageModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);

  stringValidations('title', model.title, NAME_LENGTH);
  // meta: MetaTag[] = [];        // meta tags for SEO
  categoryValidations('type', model.type, PageType);
  categoryValidations('state', model.state, ContentState);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  // sections: string[] = []; // section.bkey, section.name

  test('sections', '@sectionsTypeStringArray', () => {
    enforce(isArrayOfStrings(model.sections)).isTruthy();
  });
});


