import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isPage } from './page.util';

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
});
