import { CategoryListModel } from '@bk2/shared-models';
import { describe, expect, it } from 'vitest';
import { getItemLabel } from './category.util';

describe('category.util', () => {
  // Helper function to create test category models
  const createCategoryModel = (
    name: string,
    i18nBase?: string,
    translateItems?: boolean,
    additionalProps: Partial<CategoryListModel> = {}
  ): CategoryListModel => ({
    key: `category-${name}`,
    name,
    i18nBase: i18nBase || '',
    translateItems: translateItems || false,
    index: '',
    tags: '',
    state: 'active',
    ...additionalProps
  } as CategoryListModel);

  describe('getItemLabel', () => {
    it('should return empty string when itemName is not provided', () => {
      const category = createCategoryModel('testCategory', 'base', true);
      
      const result = getItemLabel(category, undefined);
      
      expect(result).toBe('');
    });

    it('should return empty string when itemName is null', () => {
      const category = createCategoryModel('testCategory', 'base', true);
      
      const result = getItemLabel(category, null as any);
      
      expect(result).toBe('');
    });

    it('should return empty string when itemName is empty string', () => {
      const category = createCategoryModel('testCategory', 'base', true);
      
      const result = getItemLabel(category, '');
      
      expect(result).toBe('');
    });

    it('should return itemName when i18nBase is not provided', () => {
      const category = createCategoryModel('testCategory', undefined, true);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return itemName when i18nBase is null', () => {
      const category = createCategoryModel('testCategory', null as any, true);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return itemName when i18nBase is empty string', () => {
      const category = createCategoryModel('testCategory', '', true);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return itemName when translateItems is false', () => {
      const category = createCategoryModel('testCategory', 'base', false);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return itemName when translateItems is undefined', () => {
      const category = createCategoryModel('testCategory', 'base', undefined);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return itemName when translateItems is null', () => {
      const category = createCategoryModel('testCategory', 'base', null as any);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return translation key when all conditions are met', () => {
      const category = createCategoryModel('colors', 'general.categories', true);
      const itemName = 'red';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@general.categories.colors.red.label');
    });

    it('should handle category names with special characters', () => {
      const category = createCategoryModel('user-types', 'admin.categories', true);
      const itemName = 'super-admin';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@admin.categories.user-types.super-admin.label');
    });

    it('should handle item names with special characters', () => {
      const category = createCategoryModel('status', 'app.states', true);
      const itemName = 'in_progress';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@app.states.status.in_progress.label');
    });

    it('should handle nested i18n base paths', () => {
      const category = createCategoryModel('priorities', 'ui.components.forms', true);
      const itemName = 'high';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@ui.components.forms.priorities.high.label');
    });

    it('should handle single character names', () => {
      const category = createCategoryModel('a', 'x', true);
      const itemName = 'b';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@x.a.b.label');
    });

    it('should handle numeric names as strings', () => {
      const category = createCategoryModel('123', 'numeric', true);
      const itemName = '456';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@numeric.123.456.label');
    });

    it('should handle whitespace in names', () => {
      const category = createCategoryModel('my category', 'base.path', true);
      const itemName = 'my item';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@base.path.my category.my item.label');
    });

    it('should return itemName when i18nBase has value but translateItems is false', () => {
      const category = createCategoryModel('categories', 'some.base', false);
      const itemName = 'someItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should return itemName when translateItems is true but i18nBase is empty', () => {
      const category = createCategoryModel('categories', '', true);
      const itemName = 'someItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });

    it('should handle complex category and item names', () => {
      const category = createCategoryModel('document-types', 'business.admin.categories', true);
      const itemName = 'invoice-template-v2';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@business.admin.categories.document-types.invoice-template-v2.label');
    });

    it('should handle edge case with just spaces in itemName', () => {
      const category = createCategoryModel('test', 'base', true);
      const itemName = '   ';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe('@base.test.   .label');
    });

    it('should handle case where all conditions fail', () => {
      const category = createCategoryModel('test', '', false);
      const itemName = 'testItem';
      
      const result = getItemLabel(category, itemName);
      
      expect(result).toBe(itemName);
    });
  });
});