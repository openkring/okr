import { describe, expect, it } from 'vitest';
import {
  DOC_LOOKUP_ATTEMPTS,
  DOC_LOOKUP_DELAY_MS,
  buildPosterArgs,
  buildTranscodeArgs,
  isAlbumVideoPath,
  retryUntilFound,
} from './video-path.util';

describe('isAlbumVideoPath', () => {
  it('accepts album uploads of a section', () => {
    expect(isAlbumVideoPath('tenant/scs/section/abc123/album/clip.mov')).toBe(true);
  });

  it('accepts album uploads keyed on a folder (the direct /album route)', () => {
    expect(isAlbumVideoPath('tenant/scs/folder/f42/album/clip.mp4')).toBe(true);
  });

  it('accepts the document directory', () => {
    expect(isAlbumVideoPath('tenant/scs/document/clip.mov')).toBe(true);
  });

  it('rejects the ocr and rag directories', () => {
    // those have their own triggers; a video there must not be transcoded
    expect(isAlbumVideoPath('tenant/scs/ocr/receipt.mov')).toBe(false);
    expect(isAlbumVideoPath('tenant/scs/rag/clip.mov')).toBe(false);
  });

  it('rejects a rendering, so the function never triggers on its own output', () => {
    expect(isAlbumVideoPath('tenant/scs/section/abc/album/renderings/doc1.mp4')).toBe(false);
  });

  it('rejects a path outside the tenant prefix', () => {
    expect(isAlbumVideoPath('misc/clip.mov')).toBe(false);
  });
});

describe('buildTranscodeArgs', () => {
  it('caps the height at 720, keeps even dimensions and front-loads the moov atom', () => {
    const args = buildTranscodeArgs('/tmp/in.mov', '/tmp/out.mp4');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
    expect(args.join(' ')).toContain("scale=-2:'min(720,ih)'");
    expect(args.join(' ')).toContain('libx264');
    expect(args.join(' ')).toContain('aac');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });
});

describe('buildPosterArgs', () => {
  it('seeks before the input so the seek is fast, and takes exactly one frame', () => {
    const args = buildPosterArgs('/tmp/in.mov', '/tmp/poster.jpg', 2);
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toContain('-frames:v');
    expect(args[args.length - 1]).toBe('/tmp/poster.jpg');
  });
});

describe('retryUntilFound', () => {
  /** Records every requested pause instead of serving it, so the test never actually waits. */
  function fakeSleep(): { waits: number[]; sleep: (ms: number) => Promise<void> } {
    const waits: number[] = [];
    return { waits, sleep: async (ms: number) => { waits.push(ms); } };
  }

  it('returns the first hit without pausing at all', async () => {
    const { waits, sleep } = fakeSleep();
    const seen: number[] = [];

    const result = await retryUntilFound<string>(async (attemptNo) => {
      seen.push(attemptNo);
      return 'doc-1';
    }, { sleep });

    expect(result).toEqual({ value: 'doc-1', attempts: 1 });
    expect(seen).toEqual([1]);
    expect(waits).toEqual([]);
  });

  it('bridges the race: empty twice, found on the third attempt', async () => {
    const { waits, sleep } = fakeSleep();

    const result = await retryUntilFound<string>(
      async (attemptNo) => (attemptNo < 3 ? undefined : 'doc-3'),
      { sleep },
    );

    expect(result).toEqual({ value: 'doc-3', attempts: 3 });
    // two pauses, one after each miss — and none after the hit
    expect(waits).toEqual([DOC_LOOKUP_DELAY_MS, DOC_LOOKUP_DELAY_MS]);
  });

  it('gives up after five empty attempts, having waited four times', async () => {
    const { waits, sleep } = fakeSleep();
    const seen: number[] = [];

    const result = await retryUntilFound<string>(async (attemptNo) => {
      seen.push(attemptNo);
      return undefined;
    }, { sleep });

    expect(result).toEqual({ value: undefined, attempts: DOC_LOOKUP_ATTEMPTS });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(waits).toHaveLength(DOC_LOOKUP_ATTEMPTS - 1);
  });

  it('spans the documented ~10 s window', () => {
    expect(DOC_LOOKUP_ATTEMPTS).toBe(5);
    expect(DOC_LOOKUP_DELAY_MS).toBe(2000);
  });
});
