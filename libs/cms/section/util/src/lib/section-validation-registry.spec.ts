import { describe, expect, it } from 'vitest';
import { CAL_SECTION_SHAPE, IFRAME_SECTION_SHAPE, MAP_SECTION_SHAPE } from '@bk2/shared-models';

import { getSectionValidationSuite, validateSection } from './section-validation-registry';
import { iframeSectionValidations } from './iframe-section.validations';

describe('getSectionValidationSuite', () => {
  it('returns the type-specific suite when one exists', () => {
    expect(getSectionValidationSuite('iframe')).toBe(iframeSectionValidations);
  });

  it('falls back to base validation for a type without a dedicated suite', () => {
    // 'rag' has no entry in the registry
    const suite = getSectionValidationSuite('rag');
    expect(typeof suite).toBe('function');
    expect(suite({ ...CAL_SECTION_SHAPE, type: 'rag' } as never).hasErrors('name')).toBe(false);
  });
});

describe('validateSection', () => {
  it('validates a valid section as valid', () => {
    expect(validateSection({ ...IFRAME_SECTION_SHAPE }).isValid()).toBe(true);
  });

  it('reports type-specific errors (out-of-range map latitude)', () => {
    const model = { ...MAP_SECTION_SHAPE, properties: { ...MAP_SECTION_SHAPE.properties, centerLatitude: 999 } } as never;
    expect(validateSection(model).hasErrors('centerLatitude')).toBe(true);
  });
});
