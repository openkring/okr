import { describe, expect, it } from 'vitest';
import { IFRAME_SECTION_SHAPE, IframeConfig, IframeSection } from '@okr/shared-models';

import { iframeSectionValidations } from './iframe-section.validations';

const OSM = 'https://www.openstreetmap.org/export/embed.html';
const withConfig = (properties: Partial<IframeConfig> | Record<string, unknown>): IframeSection =>
  ({ ...IFRAME_SECTION_SHAPE, properties: { ...IFRAME_SECTION_SHAPE.properties, ...properties } } as unknown as IframeSection);

describe('iframeSectionValidations', () => {
  it('passes for an iframe section with an allowed page', () => {
    expect(iframeSectionValidations(withConfig({ url: OSM })).isValid()).toBe(true);
  });

  it('passes for a legacy section with a style and without height', () => {
    expect(iframeSectionValidations(withConfig({ url: OSM, height: undefined, style: 'min-height: 400px' })).isValid()).toBe(true);
  });

  it('requires a page', () => {
    expect(iframeSectionValidations({ ...IFRAME_SECTION_SHAPE }).hasErrors('url')).toBe(true);
  });

  it('flags a non-string url', () => {
    expect(iframeSectionValidations(withConfig({ url: 123 })).hasErrors('url')).toBe(true);
  });

  it('flags a page outside the embed allowlist', () => {
    const result = iframeSectionValidations(withConfig({ url: 'https://example.com/widget' }));
    expect(result.getErrors('url')).toContain('@cms/section/feature.validation.iframeHostNotAllowed');
  });

  it('flags an unknown height', () => {
    expect(iframeSectionValidations(withConfig({ url: OSM, height: 'XL' })).hasErrors('height')).toBe(true);
  });
});
