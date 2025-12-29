import { describe, vi, beforeEach } from 'vitest';
import { SectionModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { createSection } from '@bk2/cms-section-util';

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
vi.mock('@bk2/shared-util-angular', () => ({
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
}));

describe('Section Utils', () => {
  const tenantId = 'tenant-1';
  let section: SectionModel;

  beforeEach(() => {
    vi.clearAllMocks();    
    section = createSection('cal', tenantId, 'Introduction');
    section.bkey = 'section-1';
    section.tags = 'intro,main';
    section.title = 'Section Title';
    section.subTitle = 'Section Subtitle';
    section.notes = 'Some notes';
  });

});
