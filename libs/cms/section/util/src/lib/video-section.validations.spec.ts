import { describe, expect, it } from 'vitest';
import { VIDEO_SECTION_SHAPE, VideoSection } from '@okr/shared-models';

import { videoSectionValidations } from './video-section.validations';

describe('videoSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(videoSectionValidations({ ...VIDEO_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...VIDEO_SECTION_SHAPE, title: 123 } as unknown as VideoSection;
    expect(videoSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags a non-string url', () => {
    const model = { ...VIDEO_SECTION_SHAPE, properties: { ...VIDEO_SECTION_SHAPE.properties, url: 123 } } as unknown as VideoSection;
    expect(videoSectionValidations(model).hasErrors('url')).toBe(true);
  });

  const withProps = (props: Record<string, unknown>) =>
    ({ ...VIDEO_SECTION_SHAPE, properties: { ...VIDEO_SECTION_SHAPE.properties, ...props } }) as unknown as VideoSection;

  it('does not require the url for an album video', () => {
    const r = videoSectionValidations(withProps({ url: '', documentKey: 'abc_DEF-123' }));
    expect(r.hasErrors('url')).toBe(false);
    expect(r.hasErrors('documentKey')).toBe(false);
  });

  it('flags a malformed documentKey', () => {
    expect(videoSectionValidations(withProps({ documentKey: 'a/b c' })).hasErrors('documentKey')).toBe(true);
    expect(videoSectionValidations(withProps({ documentKey: 'x'.repeat(65) })).hasErrors('documentKey')).toBe(true);
  });

  it('accepts a legacy section without documentKey', () => {
    expect(videoSectionValidations(withProps({ documentKey: undefined })).hasErrors('documentKey')).toBe(false);
  });
});
