import { describe, expect, it } from 'vitest';
import { VIDEO_SECTION_SHAPE, VideoSection } from '@okr/shared-models';

import { JOURNAL_VIDEO_CLIPS_MAX } from './journal-mode.util';
import { videoSectionValidations } from './video-section.validations';

const VALID = { ...VIDEO_SECTION_SHAPE, properties: { ...VIDEO_SECTION_SHAPE.properties, url: 'XSu0f8rh2w4' } } as VideoSection;

describe('videoSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(videoSectionValidations(VALID).hasErrors('title')).toBe(false);
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
    ({ ...VALID, properties: { ...VALID.properties, ...props } }) as unknown as VideoSection;

  it('accepts a YouTube and a Vimeo video', () => {
    expect(videoSectionValidations(VALID).isValid()).toBe(true);
    expect(videoSectionValidations(withProps({ baseUrl: 'https://player.vimeo.com/video/', url: '76979871?h=abcdef1234' })).isValid()).toBe(true);
  });

  it('requires a video', () => {
    expect(videoSectionValidations(withProps({ url: '' })).getErrors('url')).toContain('@cms/section/feature.validation.videoRequired');
    expect(videoSectionValidations({ ...VIDEO_SECTION_SHAPE }).hasErrors('url')).toBe(true);
  });

  it('does not require a video in a journal, which plays its clips', () => {
    expect(videoSectionValidations({ ...withProps({ url: '' }), journalKey: 'j1' } as VideoSection).hasErrors('url')).toBe(false);
    expect(videoSectionValidations(withProps({ url: '', clips: [] })).hasErrors('url')).toBe(false);
  });

  it('flags a player that may not be embedded', () => {
    expect(videoSectionValidations(withProps({ baseUrl: 'https://evil.example/' })).getErrors('url')).toContain('@cms/section/feature.validation.videoLinkInvalid');
    expect(videoSectionValidations(withProps({ baseUrl: 'javascript:' })).hasErrors('url')).toBe(true);
  });

  it('accepts a legacy section without aspectRatio and flags an unknown one', () => {
    expect(videoSectionValidations(withProps({ aspectRatio: undefined })).hasErrors('aspectRatio')).toBe(false);
    expect(videoSectionValidations(withProps({ aspectRatio: '9:16' })).hasErrors('aspectRatio')).toBe(false);
    expect(videoSectionValidations(withProps({ aspectRatio: '21:9' })).hasErrors('aspectRatio')).toBe(true);
  });

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

  it('accepts up to JOURNAL_VIDEO_CLIPS_MAX journal clips and flags more', () => {
    const clip = { label: 'v', url: '', altText: '' };
    expect(videoSectionValidations(withProps({ clips: undefined })).hasErrors('clips')).toBe(false);
    expect(videoSectionValidations(withProps({ clips: Array(JOURNAL_VIDEO_CLIPS_MAX).fill(clip) })).hasErrors('clips')).toBe(false);
    expect(videoSectionValidations(withProps({ clips: Array(JOURNAL_VIDEO_CLIPS_MAX + 1).fill(clip) })).hasErrors('clips')).toBe(true);
  });
});
