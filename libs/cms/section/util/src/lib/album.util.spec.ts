import { describe, expect, it } from 'vitest';
import { ALBUM_CONFIG_SHAPE, AlbumConfig, DocumentModel, DocumentRendering, ImageType } from '@okr/shared-models';

import { buildAlbumUploadPath, compareByFileName, getAlbumFileName, getDocumentImageType, isPrivateVideo, isVideoFileName, isVisibleInAlbum, toImageConfig } from './album.util';

function doc(overrides: Partial<DocumentModel> = {}): DocumentModel {
  return { ...new DocumentModel('p13'), okey: 'd1', fullPath: 'tenant/p13/document/img.jpg', mimeType: 'image/jpeg', ...overrides };
}

describe('getDocumentImageType', () => {
  it('maps the mime type to an ImageType', () => {
    expect(getDocumentImageType('image/png')).toBe(ImageType.Image);
    expect(getDocumentImageType('video/mp4')).toBe(ImageType.Video);
    expect(getDocumentImageType('audio/mpeg')).toBe(ImageType.Audio);
    expect(getDocumentImageType('application/pdf')).toBe(ImageType.Pdf);
    expect(getDocumentImageType('application/msword')).toBe(ImageType.Doc);
  });
});

describe('isVisibleInAlbum', () => {
  const config = { ...ALBUM_CONFIG_SHAPE, showPdfs: false, showDocs: true } as AlbumConfig;

  it('always shows images', () => {
    expect(isVisibleInAlbum(doc(), config)).toBe(true);
  });

  it('honours the per-type flags', () => {
    expect(isVisibleInAlbum(doc({ mimeType: 'application/pdf' }), config)).toBe(false);
    expect(isVisibleInAlbum(doc({ mimeType: 'application/msword' }), config)).toBe(true);
  });
});

describe('toImageConfig', () => {
  it('uses the storage path as url and falls back to the file name', () => {
    const image = toImageConfig(doc({ title: '', altText: '' }));
    expect(image.url).toBe('tenant/p13/document/img.jpg');
    expect(image.label).toBe('img.jpg');
    expect(image.altText).toBe('img.jpg');
    expect(image.documentKey).toBe('d1');
    expect(image.type).toBe(ImageType.Image);
  });

  it('prefers the document title', () => {
    expect(toImageConfig(doc({ title: 'Sunset' })).label).toBe('Sunset');
  });
});

describe('toImageConfig for videos', () => {
  function videoDoc(renderings: DocumentRendering[]): DocumentModel {
    const doc = new DocumentModel('scs');
    doc.okey = 'doc1';
    doc.fullPath = 'tenant/scs/section/s1/album/clip.mov';
    doc.mimeType = 'video/quicktime';
    doc.renderings = renderings;
    return doc;
  }

  it('renders the poster rendering, not the original', () => {
    const config = toImageConfig(videoDoc([
      { format: 'jpg', fullPath: 'tenant/scs/section/s1/album/renderings/doc1.jpg',
        mimeType: 'image/jpeg', size: 1, generator: 'ffmpeg' },
      { format: 'mp4', fullPath: 'tenant/scs/section/s1/album/renderings/doc1.mp4',
        mimeType: 'video/mp4', size: 1, generator: 'ffmpeg' },
    ]));
    expect(config.url).toBe('tenant/scs/section/s1/album/renderings/doc1.jpg');
    expect(config.type).toBe(ImageType.Video);
  });

  it('falls back to the original while the rendering is still missing (legacy video)', () => {
    const config = toImageConfig(videoDoc([{ format: 'mp4', fullPath: 'tenant/scs/section/s1/album/renderings/doc1.mp4',
        mimeType: 'video/mp4', size: 1, generator: 'ffmpeg' }]));
    expect(config.url).toBe('tenant/scs/section/s1/album/clip.mov');
  });

  it('keeps the document key so the player can find the mp4 rendering', () => {
    const config = toImageConfig(videoDoc([]));
    expect(config.documentKey).toBe('doc1');
  });

  it('does not mark a video without an mp4 rendering as pending: it is private (spec 1.82)', () => {
    expect(toImageConfig(videoDoc([])).pending).toBeUndefined();
  });

  it('is not pending once the mp4 rendering exists', () => {
    const config = toImageConfig(videoDoc([
      { format: 'mp4', fullPath: 'tenant/scs/section/s1/album/renderings/doc1.mp4',
        mimeType: 'video/mp4', size: 1, generator: 'ffmpeg' },
    ]));
    expect(config.pending).toBeFalsy();
  });

  it('keeps poster and playability independent: an mp4 without a jpg is ready but has no poster', () => {
    // Die Function schreibt bewusst nur das mp4, wenn der Poster-Schnitt scheitert
    // (Clip unter zwei Sekunden). Beide Felder muessen dann auseinanderlaufen.
    const config = toImageConfig(videoDoc([
      { format: 'mp4', fullPath: 'tenant/scs/section/s1/album/renderings/doc1.mp4',
        mimeType: 'video/mp4', size: 1, generator: 'ffmpeg' },
    ]));
    expect(config.pending).toBeFalsy();                                  // abspielbar
    expect(config.url).toBe('tenant/scs/section/s1/album/clip.mov');     // aber kein Poster
  });

  it('treats a jpg without an mp4 as a private video: no url, not pending (poster is signed)', () => {
    const config = toImageConfig(videoDoc([
      { format: 'jpg', fullPath: 'tenant/scs/section/s1/album/renderings/doc1.jpg',
        mimeType: 'image/jpeg', size: 1, generator: 'ffmpeg' },
    ]));
    expect(config.url).toBe('');
    expect(config.pending).toBeUndefined();
  });

  it('leaves an image untouched', () => {
    const doc = new DocumentModel('scs');
    doc.okey = 'doc2';
    doc.fullPath = 'tenant/scs/section/s1/album/photo.jpg';
    doc.mimeType = 'image/jpeg';
    expect(toImageConfig(doc).url).toBe('tenant/scs/section/s1/album/photo.jpg');
  });
});

describe('buildAlbumUploadPath', () => {
  it('nests the sanitized file name under basePath, keeping the extension last', () => {
    const path = buildAlbumUploadPath('tenant/scs/section/s1/album', 'IMG_0042.mov');
    expect(path.startsWith('tenant/scs/section/s1/album/')).toBe(true);
    expect(path.endsWith('.mov')).toBe(true);
    expect(path).toMatch(/^tenant\/scs\/section\/s1\/album\/[A-Za-z0-9]+-IMG_0042\.mov$/);
  });

  it('sanitizes umlauts and spaces in the original name', () => {
    const path = buildAlbumUploadPath('tenant/scs/section/s1/album', 'Bildschirmfoto Grün.jpg');
    expect(path).toMatch(/^tenant\/scs\/section\/s1\/album\/[A-Za-z0-9]+-Bildschirmfoto-Grun\.jpg$/);
  });

  it('produces a different path on every call, without any lookup', () => {
    // The whole point of building uniqueness in rather than probing for it: two uploads of the
    // exact same original name must never collide on the same path.
    const first = buildAlbumUploadPath('tenant/scs/section/s1/album', 'IMG_0042.mov');
    const second = buildAlbumUploadPath('tenant/scs/section/s1/album', 'IMG_0042.mov');
    expect(first).not.toBe(second);
  });
});

describe('album defaults', () => {
  it('shows videos out of the box', () => {
    // Ein hochgeladenes Video, das anschliessend unsichtbar im Album liegt, ist die
    // Fehlerklasse, bei der der Nutzer keinen Fehler sieht, sondern nichts.
    expect(ALBUM_CONFIG_SHAPE.showVideos).toBe(true);
  });

  it('keeps streaming videos opt-in', () => {
    expect(ALBUM_CONFIG_SHAPE.showStreamingVideos).toBe(false);
  });
});

describe('getAlbumFileName', () => {
  it('uses the original upload name', () => {
    expect(getAlbumFileName(doc({ title: 'Sonnenaufgang.jpg' }))).toBe('Sonnenaufgang.jpg');
  });

  it('falls back to the path, without the random upload prefix', () => {
    expect(getAlbumFileName(doc({ title: '', fullPath: 'tenant/p13/section/s1/album/a1b2c3d4-img_0042.jpg' })))
      .toBe('img_0042.jpg');
  });

  it('keeps a path segment that only looks like a prefix', () => {
    expect(getAlbumFileName(doc({ title: '', fullPath: 'tenant/p13/album/sommer-2024.jpg' })))
      .toBe('sommer-2024.jpg');
  });
});

describe('compareByFileName', () => {
  function names(docs: DocumentModel[]): string[] {
    return [...docs].sort(compareByFileName).map((d) => d.title);
  }

  it('sorts numerically, not lexically', () => {
    const docs = [doc({ title: 'IMG_10.jpg' }), doc({ title: 'IMG_2.jpg' }), doc({ title: 'IMG_1.jpg' })];
    expect(names(docs)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
  });

  it('ignores case', () => {
    const docs = [doc({ title: 'banane.jpg' }), doc({ title: 'Apfel.jpg' }), doc({ title: 'Citrone.jpg' })];
    expect(names(docs)).toEqual(['Apfel.jpg', 'banane.jpg', 'Citrone.jpg']);
  });

  it('sorts documents without a title by their path name', () => {
    const docs = [
      doc({ title: '', fullPath: 'a/zzzzzzzz-beta.jpg' }),
      doc({ title: '', fullPath: 'a/aaaaaaaa-alpha.jpg' })
    ];
    expect([...docs].sort(compareByFileName).map((d) => d.fullPath))
      .toEqual(['a/aaaaaaaa-alpha.jpg', 'a/zzzzzzzz-beta.jpg']);
  });
});

function videoDoc(renderings: Partial<DocumentRendering>[] = []): DocumentModel {
  return doc({ okey: 'v1', mimeType: 'video/quicktime', fullPath: 'tenant/scs/section/s1/album/ab/clip.mov', url: '', renderings: renderings as DocumentRendering[] });
}

describe('isPrivateVideo', () => {
  it('is true for a video without an mp4 rendering', () => { expect(isPrivateVideo(videoDoc())).toBe(true); });
  it('is false for a legacy video with an mp4 rendering', () => {
    expect(isPrivateVideo(videoDoc([{ format: 'mp4', fullPath: 'tenant/scs/section/s1/album/ab/renderings/v1.mp4' }]))).toBe(false);
  });
  it('is false for an image', () => {
    expect(isPrivateVideo(doc())).toBe(false);
  });
});

describe('toImageConfig for a private video', () => {
  it('has no url, no actionUrl and is not pending', () => {
    const c = toImageConfig(videoDoc());
    expect(c.type).toBe(ImageType.Video);
    expect(c.url).toBe('');
    expect(c.actionUrl).toBe('');
    expect(c.pending).toBeUndefined();
    expect(c.documentKey).toBe('v1');
  });
});

describe('isVideoFileName', () => {
  it('detects a .mov with an empty browser type', () => { expect(isVideoFileName('IMG_0042.MOV', '')).toBe(true); });
  it('detects by declared type', () => { expect(isVideoFileName('clip', 'video/mp4')).toBe(true); });
  it('rejects a photo', () => { expect(isVideoFileName('IMG_0042.HEIC', '')).toBe(false); });
});
