import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { ColorIonic, SectionModel } from '@bk2/shared-models';
import { booleanValidations, categoryValidations, stringValidations } from '@bk2/shared-util-core';

export const baseSectionValidations = staticSuite((model: SectionModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('type', model.type, WORD_LENGTH);
  // tbd: tagValidations('tags', model.tags);
  stringValidations('index', model.index, LONG_NAME_LENGTH);
  // tbd: tenantValidations(model.tenants);
  booleanValidations('isArchived', model.isArchived, false);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('roleNeeded', model.roleNeeded, WORD_LENGTH);
/*   omitWhen(model.roleNeeded === undefined, () => {
    test('roleNeeded', '@roleTypeMustBeRoleName', () => {
      enforce(typeof(model.roleNeeded)).equals('RoleName');
    });
  }); */
  categoryValidations('color', model.color, ColorIonic);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('subTitle', model.subTitle, SHORT_NAME_LENGTH);
  // tbd: content: ContentConfig

});
