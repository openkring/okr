
import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { booleanValidations, categoryValidations, isArrayOfBaseProperties, isArrayOfStrings, numberValidations, stringValidations, urlValidations } from '@bk2/shared/util';
import { MenuAction, MenuItemModel } from '@bk2/shared/models';
import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';

export const menuItemValidation = staticSuite((model: MenuItemModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
//  tenantValidations(model.tenants);
  numberValidations('action', model.action, true, -1, 100);
  urlValidations('url', model.url);
  stringValidations('index', model.index, LONG_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived, false);

  //tagValidations(_tags, 'tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon, SHORT_NAME_LENGTH);
  categoryValidations('category', model.action, MenuAction);

  omitWhen(model.roleNeeded === undefined, () => {
    test('roleNeeded', '@menuRoleNeededMandatory', () => {
      enforce(typeof(model.roleNeeded)).equals('RoleName');
    });
  });

  omitWhen(model.data === undefined, () => {
    test('data', '@menuDataProperty', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });

  omitWhen(model.action !== MenuAction.SubMenu, () => {
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
  omitWhen(model.action > MenuAction.Browse, () => {
    test('menuItems', '@menuItemsEmptySubMenu', () => {
      enforce(model.menuItems).isEmpty();
    });
  });  


  // if MenuAction.Navigate|Browse|SubMenu -> roleNeeded must be defined
  omitWhen(model.action > MenuAction.SubMenu, () => {
    test('roleNeeded', '@menuRoleNeededMandatory', () => {
      enforce(model.roleNeeded).isNotUndefined();
    });
  });
});

