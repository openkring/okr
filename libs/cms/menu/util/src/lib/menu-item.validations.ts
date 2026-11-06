
import { enforce, omitWhen, staticSuite, test } from 'vest';

// Vest messages are BARE keys, never '@'-prefixed: okr-error-note resolves a message
// without '@' as `validation.<key>` from the app's main bundle, which is where these
// strings live. An '@'-prefixed message is instead looked up as a TOP-LEVEL bundle key
// and silently misses — that is what rendered these four as empty error notes.

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, MAX_MENU_BAR_ITEMS, MAX_SUBMENU_OFFSET, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { MenuItemModel } from '@okr/shared-models';
import { booleanValidations, isArrayOfBaseProperties, isArrayOfStrings, numberValidations, stringValidations, urlValidations } from '@okr/shared-util-core';

import { countBarItems } from './menu-bar.util';

/**
 * `childActions` maps the `name` of each child row of a root menu to its `action`. The suite cannot
 * look the documents up, so the form passes them in; a child that is missing from it is not checked.
 */
export const menuItemValidations = staticSuite((model: MenuItemModel, tenants: string, tags: string, childActions: Record<string, string> = {}) => {
  stringValidations('okey', model.okey);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
//  tenantValidations(model.tenants);
  stringValidations('action', model.action, undefined, 0, true);
  // url needs to be validated as string, because it can contain a function name
  stringValidations('url', model.url, LONG_NAME_LENGTH);
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  booleanValidations('isArchived', model.isArchived, false);

  //tagValidations(_tags, 'tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon);
  // optional, and absent on every existing row — only checked once it is set
  omitWhen(model.info === undefined, () => {
    stringValidations('info', model.info, DESCRIPTION_LENGTH);
  });
  stringValidations('roleNeeded', model.roleNeeded, undefined, 0, true);

  omitWhen(model.data === undefined, () => {
    test('data', 'menuDataProperty', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });

  omitWhen(model.action !== 'sub', () => {
    test('menuItems', 'menuSubMenuItemsMissing', () => {
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
    test('menuItems', 'menuItemsEmptySubMenu', () => {
      enforce(model.menuItems).isEmpty();
    });
  });  

  // `menuType` is a selector value, so it carries no length cap (see the building-forms skill).
  // A non-array `menuItems` is reported by 'menuItemsType' above; here it counts as no rows.
  const children = Array.isArray(model.menuItems) ? model.menuItems : [];
  // The limit applies to the bar layouts only; a vertical or absent menuType never reaches these.
  omitWhen(model.action !== 'main' || model.menuType !== 'top', () => {
    test('menuItems', 'menuTopTooManyItems', () => {
      enforce(countBarItems(children)).lessThanOrEquals(MAX_MENU_BAR_ITEMS);
    });
  });

  omitWhen(model.action !== 'main' || model.menuType !== 'segmented', () => {
    test('menuItems', 'menuSegmentedTooManyItems', () => {
      enforce(countBarItems(children)).lessThanOrEquals(MAX_MENU_BAR_ITEMS);
    });
    // a segment says «one of these peers is selected»; it has no dropdown for a `sub` row
    test('menuItems', 'menuSegmentedNoSubmenus', () => {
      enforce(children.some(name => childActions[name] === 'sub')).isFalsy();
    });
  });

  // optional, and absent on every existing doc — only checked once it is set
  omitWhen(model.submenuOffset === undefined, () => {
    numberValidations('submenuOffset', model.submenuOffset, true, 0, MAX_SUBMENU_OFFSET);
  });
});
