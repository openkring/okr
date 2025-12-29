import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isCategoryList, isCategoryItem, getCategoryAttribute } from './category.util';

// Mock the isType function from the core utilities
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

describe('Category Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';

  let categoryList: CategoryListModel;
  let categoryItem: CategoryItemModel;

  beforeEach(() => {
    vi.clearAllMocks();

    categoryItem = new CategoryItemModel('Item 1', 'I1', 'icon1');
    categoryItem.state = 'active';
    categoryItem.price = 100;
    categoryItem.currency = 'USD';
    categoryItem.periodicity = 'monthly';

    categoryList = new CategoryListModel(tenantId);
    categoryList.bkey = 'list-1';
    categoryList.name = 'Test List';
    categoryList.tags = 'tag1,tag2';
    categoryList.isArchived = false;
    categoryList.i18nBase = 'base.key';
    categoryList.translateItems = true;
    categoryList.notes = 'Some notes';
    categoryList.items = [categoryItem];
  });

  describe('CategoryList functions', () => {
    it('isCategoryList should use the isType utility', () => {
      mockIsType.mockReturnValue(true);
      expect(isCategoryList({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(CategoryListModel));

      mockIsType.mockReturnValue(false);
      expect(isCategoryList({}, tenantId)).toBe(false);
    });
  });

  describe('CategoryItem functions', () => {
    it('isCategoryItem should use the isType utility', () => {
      mockIsType.mockReturnValue(true);
      expect(isCategoryItem({})).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(CategoryItemModel));

      mockIsType.mockReturnValue(false);
      expect(isCategoryItem({})).toBe(false);
    });
  });

  describe('getCategoryAttribute', () => {
    it('should return the correct attribute value for a found item', () => {
      const price = getCategoryAttribute(categoryList, 'Item 1', 'price');
      expect(price).toBe(100);

      const icon = getCategoryAttribute(categoryList, 'Item 1', 'icon');
      expect(icon).toBe('icon1');
    });

    it('should return an empty string if the item is not found', () => {
      const result = getCategoryAttribute(categoryList, 'Non-existent Item', 'price');
      expect(result).toBe('');
    });
  });
});
