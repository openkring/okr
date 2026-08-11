import { describe, expect, it } from 'vitest';
import { ALBUM_CONFIG_SHAPE, AlbumConfig, DocumentModel, ImageType } from '@okr/shared-models';

import { getDocumentImageType, isVisibleInAlbum, toImageConfig } from './album.util';

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
