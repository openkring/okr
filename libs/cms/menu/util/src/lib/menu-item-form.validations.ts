import { SHORT_NAME_LENGTH, WORD_LENGTH } from "@bk2/shared-constants";
import { isArrayOfBaseProperties, isArrayOfStrings, stringValidations } from "@bk2/shared-util-core";
import { enforce, omitWhen, only, staticSuite, test } from "vest";

import { MenuItemFormModel } from "./menu-item-form.model";


export const menuItemFormValidation = staticSuite((model: MenuItemFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH, 3);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 3, true);
  //urlValidations('url', model.url);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon, SHORT_NAME_LENGTH);
  stringValidations('action', model.action, WORD_LENGTH);
  // tenantValidations(model.tenants);
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
  omitWhen(model.action !== 'browse' && model.action !== 'navigate', () => {
    test('menuItems', '@menuItemsEmptySubMenu', () => {
      enforce(model.menuItems).isEmpty();
    });
  });  
});
