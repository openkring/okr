import { describe, expect, it } from 'vitest';
import { MenuItemModel, Roles, UserModel } from '@okr/shared-models';
import { canOpenMenu } from './menu-access.util';

const user = (roles: Partial<Roles>): UserModel => ({
  roles: { registered: true, privileged: false, contentAdmin: false, resourceAdmin: false, eventAdmin: false,
    memberAdmin: false, treasurer: false, admin: false, groupAdmin: false, ...roles },
} as unknown as UserModel);

const menu = (name: string, roleNeeded?: string): MenuItemModel =>
  ({ name, roleNeeded, action: 'context', menuItems: [] } as unknown as MenuItemModel);

const items = [menu('c-resources', 'resourceAdmin'), menu('c-diary', 'registered'), menu('c-open')];

describe('canOpenMenu', () => {
  it('opens when the user has the role the menu document needs', () => {
    expect(canOpenMenu(items, 'c-resources', user({ resourceAdmin: true }))).toBe(true);
  });

  it('stays closed for a role the button gate allowed but the menu does not (privileged vs resourceAdmin)', () => {
    expect(canOpenMenu(items, 'c-resources', user({ privileged: true }))).toBe(false);
  });

  it('opens for an admin on any menu', () => {
    expect(canOpenMenu(items, 'c-resources', user({ admin: true }))).toBe(true);
  });

  it('opens a menu without roleNeeded for everyone', () => {
    expect(canOpenMenu(items, 'c-open', user({}))).toBe(true);
  });

  it('stays closed for an unknown menu name, an empty name and while the list is still loading', () => {
    expect(canOpenMenu(items, 'c-missing', user({ admin: true }))).toBe(false);
    expect(canOpenMenu(items, '', user({ admin: true }))).toBe(false);
    expect(canOpenMenu(undefined, 'c-diary', user({ admin: true }))).toBe(false);
  });
});
