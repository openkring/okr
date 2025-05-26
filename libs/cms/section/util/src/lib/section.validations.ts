import { enforce, omitWhen, only, staticSuite, test} from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { ColorIonic, SectionModel, SectionType } from '@bk2/shared/models';
import { baseValidations, categoryValidations, stringValidations } from '@bk2/shared/util';


export const sectionValidations = staticSuite((model: SectionModel, field?: string) => {
  if (field) only(field);

  baseValidations(model);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  categoryValidations('category', model.type, SectionType);
/*   
  ContentConfigValidations(model.content);
  stringValidations('content', model.content, DESCRIPTION_LENGTH);
  numberValidations('colSize', model.colSize, true, 1, 6);
  categoryValidations('position', model.position, ViewPosition);
 */  
  categoryValidations('color', model.color, ColorIonic);
  stringValidations('title', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('subTitle', model.bkey, SHORT_NAME_LENGTH);

  omitWhen(model.roleNeeded === undefined, () => {
    test('roleNeeded', '@menuRoleNeededMandatory', () => {
      enforce(typeof(model.roleNeeded)).equals('RoleName');
    });
  });
});

// tbd: validate properties

