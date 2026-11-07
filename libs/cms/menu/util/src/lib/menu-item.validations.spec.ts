import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

import { MenuItemModel } from '@okr/shared-models';

import { menuItemValidations as suite } from './menu-item.validations';

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

/** The suite is static and takes the context the form passes it: tenants, tags and the child actions. */
function menuItemValidations(model: MenuItemModel, childActions: Record<string, string> = {}) {
  return suite(model, 'scs', '', childActions);
}

describe('menuItemValidations messages', () => {
  it('resolves every failure message against validation.* in the main bundle', () => {
    // A `sub` item without menuItems fails 'menuSubMenuItemsMissing'; a non-array
    // menuItems fails 'menuItemsType'; a navigate item with entries fails
    // 'menuItemsEmptySubMenu'; data holding a non-BaseType (a string/number/boolean IS
    // one, so an object is needed here) fails 'menuDataProperty'.
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `row${i}`);
    const cases: { model: MenuItemModel; childActions?: Record<string, string> }[] = [
      { model: menuItem({ action: 'sub', menuItems: undefined }) },
      { model: menuItem({ menuItems: [42] as unknown as string[] }) },
      { model: menuItem({ action: 'navigate', url: '/x', menuItems: ['a'] }) },
      { model: menuItem({ action: 'navigate', url: '/x', menuItems: [], data: [{ notABaseType: true }] as unknown as MenuItemModel['data'] }) },
      // the layout checks: a bar over the limit, and a segmented menu holding a submenu
      { model: menuItem({ action: 'main', menuType: 'top', menuItems: rows(7) }) },
      { model: menuItem({ action: 'main', menuType: 'segmented', menuItems: rows(7) }) },
      { model: menuItem({ action: 'main', menuType: 'segmented', menuItems: ['a', 'b'] }), childActions: { a: 'navigate', b: 'sub' } },
      // submenuOffset: out of range and fractional
      { model: menuItem({ action: 'main', submenuOffset: 41 }) },
      { model: menuItem({ action: 'main', submenuOffset: 2.5 }) },
    ];

    const messages = cases.flatMap(({ model, childActions }) => {
      const errors = menuItemValidations(model, childActions).getErrors() as Record<string, string[]>;
      return Object.values(errors).flat();
    });
    for (const key of ['menuTopTooManyItems', 'menuSegmentedTooManyItems', 'menuSegmentedNoSubmenus']) {
      expect(messages, `${key} never fired`).toContain(key);
    }

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.startsWith('@'), `'${message}' must not be '@'-prefixed`).toBe(false);
      expect(validation[message], `validation.${message} is missing from the main bundle`).toBeTypeOf('string');
    }
  });
});

describe('menuItemValidations: info', () => {
  const sub = { menuItems: [] };

  it('accepts a row without info (every existing doc) and an empty, plain or @key info', () => {
    for (const info of [undefined, '', 'Öffnet die Mitgliederliste', '@cms/menu/feature.info.label']) {
      expect(menuItemValidations(menuItem({ ...sub, info })).getErrors('info')).toEqual([]);
    }
  });

  it('rejects a non-string info and one longer than DESCRIPTION_LENGTH', () => {
    expect(menuItemValidations(menuItem({ ...sub, info: 42 as unknown as string })).hasErrors('info')).toBe(true);
    expect(menuItemValidations(menuItem({ ...sub, info: 'x'.repeat(10_000) })).hasErrors('info')).toBe(true);
  });
});

describe('menuItemValidations: main menu layout', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `row${i}`);
  const main = (overrides: Partial<MenuItemModel>) => menuItem({ action: 'main', ...overrides });
  const itemErrors = (model: MenuItemModel, childActions?: Record<string, string>) =>
    menuItemValidations(model, childActions).getErrors('menuItems');

  it('a left or absent menuType never fails on 31 rows', () => {
    for (const menuType of ['left', 'right', undefined] as const) {
      const result = menuItemValidations(main({ menuType, menuItems: rows(31) }));
      expect(result.getErrors(), String(menuType)).toEqual({});
    }
  });

  it('top with 6 rows plus login, logout and profile is valid', () => {
    const model = main({ menuType: 'top', menuItems: [...rows(6), 'login', 'logout', 'profile'] });
    expect(itemErrors(model)).toEqual([]);
  });

  it('top with 7 rows fails with menuTopTooManyItems', () => {
    expect(itemErrors(main({ menuType: 'top', menuItems: rows(7) }))).toEqual(['menuTopTooManyItems']);
  });

  it('segmented with 7 rows fails with menuSegmentedTooManyItems', () => {
    expect(itemErrors(main({ menuType: 'segmented', menuItems: rows(7) }))).toEqual(['menuSegmentedTooManyItems']);
  });

  it('a divider row takes no slot, in top and in segmented', () => {
    const childActions = { line: 'divider' };
    expect(itemErrors(main({ menuType: 'top', menuItems: [...rows(6), 'line'] }), childActions)).toEqual([]);
    expect(itemErrors(main({ menuType: 'segmented', menuItems: [...rows(6), 'line'] }), childActions)).toEqual([]);
  });

  it('segmented with 6 flat rows is valid', () => {
    const childActions = Object.fromEntries(rows(6).map(name => [name, 'navigate']));
    expect(itemErrors(main({ menuType: 'segmented', menuItems: rows(6) }), childActions)).toEqual([]);
  });

  it('segmented with a sub child fails with menuSegmentedNoSubmenus', () => {
    const model = main({ menuType: 'segmented', menuItems: ['a', 'b'] });
    expect(itemErrors(model, { a: 'navigate', b: 'sub' })).toEqual(['menuSegmentedNoSubmenus']);
  });

  it('segmented ignores a child whose action is unknown, and never checks a top menu', () => {
    expect(itemErrors(main({ menuType: 'segmented', menuItems: ['a', 'ghost'] }), { a: 'navigate' })).toEqual([]);
    expect(itemErrors(main({ menuType: 'top', menuItems: ['a'] }), { a: 'sub' })).toEqual([]);
  });

  it('submenuOffset of 41 or 2.5 fails, absent passes', () => {
    expect(menuItemValidations(main({ submenuOffset: 41 })).hasErrors('submenuOffset')).toBe(true);
    expect(menuItemValidations(main({ submenuOffset: 2.5 })).hasErrors('submenuOffset')).toBe(true);
    expect(menuItemValidations(main({ submenuOffset: undefined })).hasErrors('submenuOffset')).toBe(false);
    for (const ok of [0, 5, 40]) {
      expect(menuItemValidations(main({ submenuOffset: ok })).hasErrors('submenuOffset'), String(ok)).toBe(false);
    }
  });
});
