import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, checkVideoLimits, formatDuration } from './video.util';

/** A File stand-in: only `size` and `type` are read before the duration probe. */
function fakeFile(size: number, type = 'video/mp4'): File {
  return { size, type, name: 'clip.mp4' } as File;
}

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(252)).toBe('4:12');
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(9)).toBe('0:09');
  });

  it('rounds down to whole seconds', () => {
    expect(formatDuration(65.9)).toBe('1:05');
  });
});

describe('checkVideoLimits', () => {
  it('rejects a file above the size limit without probing the duration', async () => {
    const result = await checkVideoLimits(fakeFile(MAX_VIDEO_BYTES + 1));
    expect(result).toEqual({ ok: false, reason: 'size', actual: MAX_VIDEO_BYTES + 1 });
  });

  it('accepts a file at exactly the size limit when the duration cannot be probed', async () => {
    // jsdom has no media stack: loadedmetadata never fires, the probe times out and the
    // size check alone decides. That is the documented fallback (spec §4).
    const result = await checkVideoLimits(fakeFile(MAX_VIDEO_BYTES));
    expect(result.ok).toBe(true);
  });

  it('exposes the limits it enforces', () => {
    expect(MAX_VIDEO_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_VIDEO_SECONDS).toBe(120);
  });
});
