import { describe, expect, it } from 'vitest';
import {
  DOC_LOOKUP_ATTEMPTS,
  DOC_LOOKUP_DELAY_MS,
  buildPosterArgs,
  buildTranscodeArgs,
  isAlbumSourcePath,
  isAlbumVideoPath,
  isOwnRendering,
  isRenderingPath,
  isVideoUpload,
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

describe('isVideoUpload', () => {
  it('accepts a declared video content type', () => {
    expect(isVideoUpload('tenant/scs/section/a/album/clip.mp4', 'video/mp4')).toBe(true);
    expect(isVideoUpload('tenant/scs/section/a/album/clip.mov', 'video/quicktime')).toBe(true);
  });

  it('accepts an UPPERCASE declared type — Storage does not normalise what the client sent', () => {
    expect(isVideoUpload('tenant/scs/section/a/album/clip.mp4', 'VIDEO/MP4')).toBe(true);
  });

  it('falls back to the extension when the browser reported no type at all', () => {
    // the regression this exists for: Chrome/Firefox report '' for a .mov
    expect(isVideoUpload('tenant/scs/section/a/album/IMG_0042.mov', '')).toBe(true);
    expect(isVideoUpload('tenant/scs/section/a/album/IMG_0042.MOV', '')).toBe(true);
  });

  it("falls back to the extension for Firebase's x-www-form-urlencoded default", () => {
    // 147 live objects carry exactly this; it means "nothing was declared", not "not a video"
    expect(isVideoUpload(
      'tenant/scs/section/a/album/IMG_0042.mov',
      'application/x-www-form-urlencoded;charset=UTF-8',
    )).toBe(true);
  });

  it('rejects an image, declared or undeclared', () => {
    expect(isVideoUpload('tenant/scs/section/a/album/IMG_0042.jpg', 'image/jpeg')).toBe(false);
    expect(isVideoUpload('tenant/scs/section/a/album/IMG_0042.heic', '')).toBe(false);
  });

  it('rejects a file whose extension says nothing and whose type says nothing', () => {
    expect(isVideoUpload('tenant/scs/section/a/album/notes', '')).toBe(false);
  });
});

/** The scale filter both builders must use — asserted literally, because its exact text is the fix. */
const SCALE_FILTER = "scale=-2:'min(720,trunc(ih/2)*2)'";

describe('buildTranscodeArgs', () => {
  it('caps the height at 720, keeps even dimensions and front-loads the moov atom', () => {
    const args = buildTranscodeArgs('/tmp/in.mov', '/tmp/out.mp4');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
    expect(args.join(' ')).toContain(SCALE_FILTER);
    expect(args.join(' ')).toContain('libx264');
    expect(args.join(' ')).toContain('aac');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });

  it('rounds the source height down to even BEFORE capping it', () => {
    // min(720,ih) alone let an odd source height (1079, 607 — a phone-cropped clip) through
    // unchanged, and libx264 refuses "height not divisible by 2", failing the whole transcode.
    const filter = buildTranscodeArgs('/tmp/in.mov', '/tmp/out.mp4').join(' ');
    expect(filter).toContain('trunc(ih/2)*2');
    expect(filter).not.toContain("min(720,ih)'");
  });
});

describe('buildPosterArgs', () => {
  it('seeks before the input so the seek is fast, and takes exactly one frame', () => {
    const args = buildPosterArgs('/tmp/in.mov', '/tmp/poster.jpg', 2);
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toContain('-frames:v');
    expect(args[args.length - 1]).toBe('/tmp/poster.jpg');
  });

  it('scales the poster like the video, so a 4K clip does not leave a multi-MB JPEG behind', () => {
    const args = buildPosterArgs('/tmp/in.mov', '/tmp/poster.jpg', 2);
    expect(args).toContain('-vf');
    expect(args.join(' ')).toContain(SCALE_FILTER);
  });

  it('uses the very same filter as the transcode — a poster is never larger than its video', () => {
    const poster = buildPosterArgs('/tmp/in.mov', '/tmp/poster.jpg', 0);
    const video = buildTranscodeArgs('/tmp/in.mov', '/tmp/out.mp4');
    expect(poster[poster.indexOf('-vf') + 1]).toBe(video[video.indexOf('-vf') + 1]);
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
});


describe('isRenderingPath', () => {
  it('recognises the renderings directory', () => {
    expect(isRenderingPath('tenant/scs/section/a/album/renderings/doc1.mp4')).toBe(true);
    expect(isRenderingPath('tenant/scs/document/renderings/doc1.jpg')).toBe(true);
  });

  it('does not mistake a source upload for a rendering', () => {
    expect(isRenderingPath('tenant/scs/section/a/album/clip.mov')).toBe(false);
    // a FILE named renderings is not the renderings DIRECTORY
    expect(isRenderingPath('tenant/scs/section/a/album/renderings.mov')).toBe(false);
  });
});

describe('isAlbumSourcePath', () => {
  it('is the predicate isAlbumVideoPath delegates to — both triggers share one rule', () => {
    const paths = [
      'tenant/scs/section/abc/album/clip.mov',
      'tenant/scs/folder/f1/album/clip.mp4',
      'tenant/scs/document/clip.mov',
      'tenant/scs/section/abc/album/renderings/doc1.mp4',
      'tenant/scs/rag/clip.mov',
      'misc/clip.mov',
    ];
    for (const p of paths) expect(isAlbumSourcePath(p)).toBe(isAlbumVideoPath(p));
  });

  it('accepts an image original too — the reaper is not video-specific', () => {
    expect(isAlbumSourcePath('tenant/scs/section/abc/album/photo.jpg')).toBe(true);
  });

  it('rejects a rendering, which is what terminates the reaper recursion', () => {
    // every object the reaper deletes lives here and fires onObjectDeleted again; this is the
    // one and only thing that stops the second delivery from doing any work
    expect(isAlbumSourcePath('tenant/scs/section/abc/album/renderings/doc1.mp4')).toBe(false);
    expect(isAlbumSourcePath('tenant/scs/section/abc/album/renderings/doc1.jpg')).toBe(false);
  });
});

describe('isOwnRendering', () => {
  const source = 'tenant/scs/section/abc/album/clip.mov';

  it('accepts the paths renderingPath() mints for the same document', () => {
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc1.mp4')).toBe(true);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc1.jpg')).toBe(true);
  });

  it('accepts an svg rendering of a document in the document directory', () => {
    expect(isOwnRendering(
      'tenant/scs/document/logo.png', 'd7', 'tenant/scs/document/renderings/d7.svg')).toBe(true);
  });

  it('rejects a rendering belonging to a DIFFERENT document in the same directory', () => {
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc2.mp4')).toBe(false);
    // a key that merely starts the same must not pass either
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc12.mp4')).toBe(false);
  });

  it('rejects a path outside the source own renderings directory', () => {
    // the containment check that keeps a client-writable renderings[] from turning the
    // storage trigger into an arbitrary-delete primitive
    expect(isOwnRendering(source, 'doc1', 'tenant/other/document/annual-report.pdf')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/xyz/album/renderings/doc1.mp4')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/doc1.mp4')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/sub/doc1.mp4')).toBe(false);
  });

  it('rejects the source itself, so the original can never be reaped as its own rendering', () => {
    expect(isOwnRendering(source, 'doc1', source)).toBe(false);
  });

  it('rejects malformed entries instead of guessing', () => {
    expect(isOwnRendering(source, 'doc1', '')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc1')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc1.')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/.mp4')).toBe(false);
    expect(isOwnRendering(source, 'doc1', 'tenant/scs/section/abc/album/renderings/doc1.tar.gz')).toBe(false);
  });
});
