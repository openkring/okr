import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MenuItemModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isMenuItem } from './menu.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));
vi.mock('@bk2/shared-util-angular', () => ({
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
}));

describe('Menu Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let rootMenuItem: MenuItemModel;
  let childMenuItem: MenuItemModel;

  beforeEach(() => {
    vi.clearAllMocks();

    rootMenuItem = new MenuItemModel(tenantId);
    rootMenuItem.bkey = 'root-1';
    rootMenuItem.name = 'Main Menu';
    rootMenuItem.label = '@menu.main';
    rootMenuItem.action = 'navigate';
    rootMenuItem.url = '/home';
    rootMenuItem.menuItems = ['child-1'];

    childMenuItem = new MenuItemModel(tenantId);
    childMenuItem.bkey = 'child-1';
    childMenuItem.name = 'Sub Menu';
    childMenuItem.label = '@menu.sub';
    childMenuItem.action = 'navigate';
    childMenuItem.url = '/about';
    childMenuItem.menuItems = [];

    const anotherRoot = new MenuItemModel(tenantId);
    anotherRoot.bkey = 'root-2';
    anotherRoot.name = 'Another Menu';
    anotherRoot.label = '@menu.another';
    anotherRoot.menuItems = [];
  });

  describe('isMenuItem', () => {
    it('should use the isType utility to check the object type', () => {
      mockIsType.mockReturnValue(true);
      expect(isMenuItem({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(MenuItemModel));

      mockIsType.mockReturnValue(false);
      expect(isMenuItem({}, tenantId)).toBe(false);
    });
  });
});
