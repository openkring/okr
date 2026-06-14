import { describe, expect, it } from 'vitest';
import { VIDEO_SECTION_SHAPE, VideoSection } from '@bk2/shared-models';

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
});
