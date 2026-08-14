import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

import { MenuItemModel } from '@okr/shared-models';

import { menuItemValidations } from './menu-item.validations';

/**
 * The app's main bundle is the authority for validation messages: `okr-error-note`
 * resolves a Vest message as `validation.<message>` (and only an '@'-prefixed one as a
 * top-level key, which is why '@menuDataProperty' & co. used to render nothing).
 */
const validation = JSON.parse(
  readFileSync('apps/scs-app/src/assets/i18n/de.json', 'utf8'),
).validation as Record<string, string>;

function menuItem(overrides: Partial<MenuItemModel> = {}): MenuItemModel {
  return {
    okey: 'test-menu', name: 'test-menu', url: '', action: 'sub', index: '',
    isArchived: false, description: '', label: 'Test', icon: 'menu',
    roleNeeded: 'registered', tenants: ['scs'],
    ...overrides,
  } as MenuItemModel;
}

describe('menuItemValidations messages', () => {
  it('resolves every failure message against validation.* in the main bundle', () => {
    // A `sub` item without menuItems fails 'menuSubMenuItemsMissing'; a non-array
    // menuItems fails 'menuItemsType'; a navigate item with entries fails
    // 'menuItemsEmptySubMenu'; data holding a non-BaseType (a string/number/boolean IS
    // one, so an object is needed here) fails 'menuDataProperty'.
    const cases: MenuItemModel[] = [
      menuItem({ action: 'sub', menuItems: undefined }),
      menuItem({ menuItems: [42] as unknown as string[] }),
      menuItem({ action: 'navigate', url: '/x', menuItems: ['a'] }),
      menuItem({ action: 'navigate', url: '/x', menuItems: [], data: [{ notABaseType: true }] as unknown as MenuItemModel['data'] }),
    ];

    const messages = cases.flatMap(model => {
      const errors = menuItemValidations(model, 'scs', '').getErrors() as Record<string, string[]>;
      return Object.values(errors).flat();
    });

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.startsWith('@'), `'${message}' must not be '@'-prefixed`).toBe(false);
      expect(validation[message], `validation.${message} is missing from the main bundle`).toBeTypeOf('string');
    }
  });
});
