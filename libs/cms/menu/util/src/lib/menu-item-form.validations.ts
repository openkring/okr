import { SHORT_NAME_LENGTH } from "@bk2/shared-constants";
import { MenuAction, RoleEnum } from "@bk2/shared-models";
import { categoryValidations, isArrayOfBaseProperties, isArrayOfStrings, stringValidations } from "@bk2/shared-util-core";
import { enforce, omitWhen, only, staticSuite, test } from "vest";

import { MenuItemFormModel } from "./menu-item-form.model";


export const menuItemFormValidation = staticSuite((model: MenuItemFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH, 3);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 3, true);
  //urlValidations('url', model.url);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon, SHORT_NAME_LENGTH);
  categoryValidations('action', model.action, MenuAction);
 // tenantValidations(model.tenants);
  categoryValidations('roleNeeded', model.roleNeeded, RoleEnum);

  omitWhen(model.data === undefined, () => {
    test('data', '@menuDataProperty', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });

  omitWhen(model.action !== MenuAction.SubMenu, () => {
    test('menuItems', '@menuSubMenuItemsMissing', () => {
      enforce(model.menuItems).isNotUndefined();
    });
    test('menuItems', '@menuItemsType', () => {
      enforce(isArrayOfStrings(model.menuItems)).isTruthy();
    });
  });
  
  omitWhen(model.menuItems === undefined, () => {
    test('menuItems', '@menuTypeString', () => {
      enforce(isArrayOfStrings(model.menuItems)).isTruthy();
    });
  });

  // if MenuAction.Navigate|Browse -> url must be defined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  omitWhen(model.action! > MenuAction.Browse, () => {
    test('menuItems', '@menuItemsEmptySubMenu', () => {
      enforce(model.menuItems).isEmpty();
    });
  });  

  // if MenuAction.Navigate|Browse -> roleNeeded must be defined
  omitWhen(model.action === MenuAction.Browse, () => {
    test('roleNeeded', '@menuRoleNeededMandatory', () => {
      enforce(model.roleNeeded).isNotUndefined();
    });
  });
});
