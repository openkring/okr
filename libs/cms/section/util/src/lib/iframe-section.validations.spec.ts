import { describe, expect, it } from 'vitest';
import { IFRAME_SECTION_SHAPE, IframeSection } from '@bk2/shared-models';

import { iframeSectionValidations } from './iframe-section.validations';

describe('iframeSectionValidations', () => {
  it('passes for a valid iframe section', () => {
    const result = iframeSectionValidations({ ...IFRAME_SECTION_SHAPE });
    expect(result.isValid()).toBe(true);
  });

  it('flags a non-string url', () => {
    const model = { ...IFRAME_SECTION_SHAPE, properties: { ...IFRAME_SECTION_SHAPE.properties, url: 123 } } as unknown as IframeSection;
    const result = iframeSectionValidations(model);
    expect(result.hasErrors('url')).toBe(true);
  });
});
