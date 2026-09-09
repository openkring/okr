import { describe, expect, it } from 'vitest';
import { buildPosterArgs, buildTranscodeArgs, isAlbumVideoPath } from './video-path.util';

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
