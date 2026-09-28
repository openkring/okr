import { describe, expect, it } from 'vitest';
import { MEDIA_RETRY_DELAYS_MS, mediaRetryDelayMs, shouldUseImagePreview } from './media-preview.util';

describe('shouldUseImagePreview', () => {
  it('uses the server preview for a large photo', () => {
    expect(shouldUseImagePreview('image/jpeg', 9_547_885)).toBe(true);
    expect(shouldUseImagePreview('image/png', 1_000_000)).toBe(true);
    expect(shouldUseImagePreview('image/webp', 500_000)).toBe(true);
  });

  it('uses the preview when the size is unknown', () => {
    expect(shouldUseImagePreview('image/jpeg', undefined)).toBe(true);
  });

  it('downloads a small image as-is — a preview would not be smaller', () => {
    expect(shouldUseImagePreview('image/jpeg', 6_738)).toBe(false);
    expect(shouldUseImagePreview('image/png', 200_000)).toBe(false);
  });

  it('never previews formats a thumbnail would break', () => {
    expect(shouldUseImagePreview('image/gif', 5_000_000)).toBe(false); // animation lost
    expect(shouldUseImagePreview('image/svg+xml', 5_000_000)).toBe(false); // not thumbnailable
  });

  it('ignores MIME parameters and case', () => {
    expect(shouldUseImagePreview('IMAGE/JPEG; charset=binary', 5_000_000)).toBe(true);
  });

  it('never previews a non-image or an unknown type', () => {
    expect(shouldUseImagePreview('video/mp4', 5_000_000)).toBe(false);
    expect(shouldUseImagePreview(undefined, 5_000_000)).toBe(false);
    expect(shouldUseImagePreview('', 5_000_000)).toBe(false);
  });
});

describe('mediaRetryDelayMs', () => {
  it('backs off over the scheduled attempts', () => {
    expect(mediaRetryDelayMs(0)).toBe(MEDIA_RETRY_DELAYS_MS[0]);
    expect(mediaRetryDelayMs(1)).toBe(MEDIA_RETRY_DELAYS_MS[1]);
    expect(MEDIA_RETRY_DELAYS_MS[1]).toBeGreaterThan(MEDIA_RETRY_DELAYS_MS[0]);
  });

  it('gives up automatically after the last scheduled attempt', () => {
    expect(mediaRetryDelayMs(MEDIA_RETRY_DELAYS_MS.length)).toBeUndefined();
    expect(mediaRetryDelayMs(99)).toBeUndefined();
  });

  it('rejects a negative attempt', () => {
    expect(mediaRetryDelayMs(-1)).toBeUndefined();
  });
});
