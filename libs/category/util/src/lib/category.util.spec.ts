import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { convertCategoryListToForm, convertFormToCategoryList, isCategoryList, convertCategoryItemToForm, convertFormToCategoryItem, isCategoryItem, getCategoryAttribute } from './category.util';
import { CategoryItemFormModel, CategoryListFormModel } from './category-form.model';

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
    it('convertCategoryListToForm should copy all properties', () => {
      const formModel = convertCategoryListToForm(categoryList);
      expect(formModel.bkey).toBe(categoryList.bkey);
      expect(formModel.name).toBe(categoryList.name);
      expect(formModel.items).toEqual(categoryList.items);
    });

    it('convertFormToCategoryList should update an existing model', () => {
      const formModel: CategoryListFormModel = {
        bkey: '',
        name: 'Updated Name',
        tags: 'updated-tag',
        isArchived: false,
        tenants: ['test'],
        index: 'n:Updated Name',
        i18nBase: 'updated.base',
        translateItems: false,
        notes: 'updated notes',
        items: [],
      } as CategoryListFormModel;

      const updatedList = convertFormToCategoryList(categoryList, formModel, tenantId);
      expect(updatedList.name).toBe('Updated Name');
      expect(updatedList.tags).toBe('updated-tag');
      expect(updatedList.translateItems).toBe(false);
    });

    it('convertFormToCategoryList should create a new model if none is provided', () => {
      const formModel: CategoryListFormModel = { name: 'New List' } as CategoryListFormModel;
      const newList = convertFormToCategoryList(undefined, formModel, tenantId);
      expect(newList).toBeInstanceOf(CategoryListModel);
      expect(newList.name).toBe('New List');
      expect(newList.tenants[0]).toBe(tenantId);
    });

    it('isCategoryList should use the isType utility', () => {
      mockIsType.mockReturnValue(true);
      expect(isCategoryList({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(CategoryListModel));

      mockIsType.mockReturnValue(false);
      expect(isCategoryList({}, tenantId)).toBe(false);
    });
  });

  describe('CategoryItem functions', () => {
    it('convertCategoryItemToForm should copy all properties', () => {
      const formModel = convertCategoryItemToForm(categoryItem);
      expect(formModel.name).toBe('Item 1');
      expect(formModel.abbreviation).toBe('I1');
      expect(formModel.price).toBe(100);
    });

    it('convertFormToCategoryItem should update an existing item', () => {
      const formModel: CategoryItemFormModel = {
        name: 'Updated Item',
        abbreviation: 'UI',
        icon: 'icon2',
        state: 'inactive',
        price: 200,
        currency: 'EUR',
        periodicity: 'yearly',
      };
      const updatedItem = convertFormToCategoryItem(categoryItem, formModel);
      expect(updatedItem.name).toBe('Updated Item');
      expect(updatedItem.price).toBe(200);
      expect(updatedItem.state).toBe('inactive');
    });

    it('convertFormToCategoryItem should create a new item with defaults', () => {
      const formModel: CategoryItemFormModel = { name: 'New Item' } as CategoryItemFormModel;
      const newItem = convertFormToCategoryItem(undefined, formModel);
      expect(newItem).toBeInstanceOf(CategoryItemModel);
      expect(newItem.name).toBe('New Item');
      expect(newItem.state).toBe('active');
      expect(newItem.price).toBe(0);
      expect(newItem.currency).toBe('CHF');
    });

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
