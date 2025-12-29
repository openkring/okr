
import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { MenuItemModel } from '@bk2/shared-models';
import { booleanValidations, isArrayOfBaseProperties, isArrayOfStrings, numberValidations, stringValidations, urlValidations } from '@bk2/shared-util-core';

export const menuItemValidations = staticSuite((model: MenuItemModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
//  tenantValidations(model.tenants);
  stringValidations('action', model.action, WORD_LENGTH, 3, true);
  // url needs to be validated as string, because it can contain a function name
  stringValidations('url', model.url, LONG_NAME_LENGTH);
  stringValidations('index', model.index, LONG_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived, false);

  //tagValidations(_tags, 'tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon, SHORT_NAME_LENGTH);
  stringValidations('roleNeeded', model.roleNeeded, WORD_LENGTH, 4, true);

  omitWhen(model.data === undefined, () => {
    test('data', '@menuDataProperty', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });

  omitWhen(model.action !== 'sub', () => {
    test('menuItems', '@menuSubMenuItemsMissing', () => {
      enforce(model.menuItems).isNotUndefined();
    });
  });

  omitWhen(model.menuItems === undefined, () => {
    test('menuItems', 'menuItemsType', () => {
      enforce(isArrayOfStrings(model.menuItems)).isTruthy();
    });
  });

  // if MenuAction.Navigate|Browse -> url must be defined
  omitWhen(model.action !== 'browse' && model.action !== 'navigate', () => {
    test('menuItems', '@menuItemsEmptySubMenu', () => {
      enforce(model.menuItems).isEmpty();
    });
  });  
});

