import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectionModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isSection, convertSectionToForm, convertFormToSection } from './section.util';
import { SectionFormModel } from './section-form.model';

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
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let section: SectionModel;

  beforeEach(() => {
    vi.clearAllMocks();
    section = new SectionModel(tenantId);
    section.bkey = 'section-1';
    section.name = 'Introduction';
    section.tags = 'intro,main';
    section.title = 'Section Title';
    section.subTitle = 'Section Subtitle';
    section.type = 'calendar';
    section.description = 'Some notes';
  });

  describe('isSection', () => {
    it('should use the isType utility to check the object type', () => {
      mockIsType.mockReturnValue(true);
      expect(isSection({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(SectionModel));

      mockIsType.mockReturnValue(false);
      expect(isSection({}, tenantId)).toBe(false);
    });
  });

  describe('convertSectionToForm', () => {
    it('should convert a SectionModel to a SectionFormModel', () => {
      const formModel = convertSectionToForm(section);
      expect(formModel.bkey).toBe('section-1');
      expect(formModel.name).toBe('Introduction');
      expect(formModel.title).toBe('Section Title');
      expect(formModel.type).toBe('calendar');
    });

    it('should handle default values for optional fields', () => {
      const minimalSection = new SectionModel(tenantId);
      minimalSection.bkey = 'min-section';
      minimalSection.name = 'Minimal';
      const formModel = convertSectionToForm(minimalSection);
      expect(formModel.type).toBe('article');
    });
  });

  describe('convertFormToSection', () => {
    let formModel: SectionFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'section-1',
        name: 'Updated Section',
        tags: 'updated,tags',
        title: 'Updated Title',
        subTitle: 'Updated Subtitle',
        type: 'button',
        description: 'Updated notes',
      };
    });

    it('should update an existing SectionModel from a form model', () => {
      const updatedSection = convertFormToSection(section, formModel, tenantId);
      expect(updatedSection.name).toBe('Updated Section');
      expect(updatedSection.title).toBe('Updated Title');
      expect(updatedSection.type).toBe('button');
      expect(updatedSection.description).toBe('Updated notes');
      expect(updatedSection.bkey).toBe('section-1'); // Should not be changed
    });

    it('should create a new SectionModel if one is not provided', () => {
      const newSection = convertFormToSection(undefined, formModel, tenantId);
      expect(newSection).toBeInstanceOf(SectionModel);
      expect(newSection.name).toBe('Updated Section');
      expect(newSection.tenants[0]).toEqual(tenantId);
    });

    it('should use the name for the bkey if bkey is empty or null', () => {
      formModel.bkey = '';
      formModel.name = 'new-section-key';
      const newSection = convertFormToSection(undefined, formModel, tenantId);
      expect(newSection.bkey).toBe('new-section-key');
    });

    it('should handle null or undefined values in the form model and apply defaults', () => {
      const partialForm: SectionFormModel = { name: 'Partial Section' } as SectionFormModel;
      const newSection = convertFormToSection(undefined, partialForm, tenantId);
      expect(newSection.name).toBe('Partial Section');
      expect(newSection.title).toBe('');
      expect(newSection.type).toBe('article');
      expect(newSection.description).toBe('');
    });
  });
});
