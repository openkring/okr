import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isPage, convertPageToForm, convertFormToPage } from './page.util';
import { PageFormModel } from './page-form.model';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));

describe('Page Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let page: PageModel;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new PageModel(tenantId);
    page.bkey = 'page-1';
    page.name = 'Home Page';
    page.tags = 'home,main';
    page.title = 'Welcome to the Home Page';
    page.type = 'content';
    page.state = 'published';
    page.notes = 'Some notes';
    page.sections = ['section-1', 'section-2'];
  });

  describe('isPage', () => {
    it('should use the isType utility to check the object type', () => {
      mockIsType.mockReturnValue(true);
      expect(isPage({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(PageModel));

      mockIsType.mockReturnValue(false);
      expect(isPage({}, tenantId)).toBe(false);
    });
  });

  describe('convertPageToForm', () => {
    it('should convert a PageModel to a PageFormModel', () => {
      const formModel = convertPageToForm(page);
      expect(formModel.bkey).toBe('page-1');
      expect(formModel.name).toBe('Home Page');
      expect(formModel.title).toBe('Welcome to the Home Page');
      expect(formModel.type).toBe('content');
      expect(formModel.state).toBe('published');
      expect(formModel.sections).toEqual(['section-1', 'section-2']);
    });

    it('should handle default values for optional fields', () => {
      const minimalPage = new PageModel(tenantId);
      minimalPage.bkey = 'min-page';
      minimalPage.name = 'Minimal';
      const formModel = convertPageToForm(minimalPage);
      expect(formModel.type).toBe('content');
      expect(formModel.state).toBe('draft');
    });
  });

  describe('convertFormToPage', () => {
    let formModel: PageFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'page-1',
        name: 'Updated Page',
        tags: 'updated,tags',
        tenants: [tenantId],
        title: 'Updated Title',
        type: 'blog',
        state: 'archived',
        notes: 'Updated notes',
        sections: ['section-3'],
      };
    });

    it('should update an existing PageModel from a form model', () => {
      const updatedPage = convertFormToPage(page, formModel, tenantId);
      expect(updatedPage.name).toBe('Updated Page');
      expect(updatedPage.title).toBe('Updated Title');
      expect(updatedPage.type).toBe('blog');
      expect(updatedPage.state).toBe('archived');
      expect(updatedPage.bkey).toBe('page-1'); // Should not be changed
    });

    it('should create a new PageModel if one is not provided', () => {
      const newPage = convertFormToPage(undefined, formModel, tenantId);
      expect(newPage).toBeInstanceOf(PageModel);
      expect(newPage.name).toBe('Updated Page');
      expect(newPage.tenants[0]).toEqual(tenantId);
    });

    it('should use the name for the bkey if bkey is empty or null', () => {
      formModel.bkey = '';
      formModel.name = 'new-page-key';
      const newPage = convertFormToPage(undefined, formModel, tenantId);
      expect(newPage.bkey).toBe('new-page-key');
    });

    it('should handle null or undefined values in the form model and apply defaults', () => {
      const partialForm: PageFormModel = { name: 'Partial Page' } as any;
      const newPage = convertFormToPage(undefined, partialForm, tenantId);
      expect(newPage.name).toBe('Partial Page');
      expect(newPage.title).toBe('');
      expect(newPage.type).toBe('content');
      expect(newPage.state).toBe('draft');
      expect(newPage.sections).toEqual([]);
    });
  });
});
