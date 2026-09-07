import { describe, expect, it } from 'vitest';

import { DocumentModel, IMAGE_CONFIG_SHAPE } from '@okr/shared-models';

import { getMimeClass, mimeMatches, parseMimeFilter, toGalleryImage } from './document.util';

describe('getMimeClass', () => {
  it('classifies every image subtype as image', () => {
    expect(getMimeClass('image/jpeg')).toBe('image');
    expect(getMimeClass('image/heic')).toBe('image');
    expect(getMimeClass('image/svg+xml')).toBe('image');
  });

  it('classifies pdf, video and audio', () => {
    expect(getMimeClass('application/pdf')).toBe('pdf');
    expect(getMimeClass('video/mp4')).toBe('video');
    expect(getMimeClass('audio/mpeg')).toBe('audio');
  });

  it('is case insensitive', () => {
    expect(getMimeClass('IMAGE/JPEG')).toBe('image');
    expect(getMimeClass('Application/PDF')).toBe('pdf');
  });

  it('falls back to doc for anything else, including missing input', () => {
    expect(getMimeClass('application/vnd.ms-excel')).toBe('doc');
    expect(getMimeClass('')).toBe('doc');
    expect(getMimeClass(undefined)).toBe('doc');
  });
});

describe('parseMimeFilter', () => {
  it('parses a comma separated list', () => {
    expect(parseMimeFilter('image,pdf')).toEqual(['image', 'pdf']);
  });

  it('trims, lowercases and de-duplicates', () => {
    expect(parseMimeFilter(' Image , pdf ,IMAGE')).toEqual(['image', 'pdf']);
  });

  it('drops unknown entries but keeps the understood ones', () => {
    expect(parseMimeFilter('image,spreadsheet,pdf')).toEqual(['image', 'pdf']);
  });

  it('returns an empty filter for empty, missing or wholly unknown input', () => {
    expect(parseMimeFilter('')).toEqual([]);
    expect(parseMimeFilter(undefined)).toEqual([]);
    // an unparseable value must degrade to "no filter", never to "match nothing"
    expect(parseMimeFilter('nonsense')).toEqual([]);
  });
});

describe('mimeMatches', () => {
  it('passes everything when the filter is empty', () => {
    expect(mimeMatches('application/vnd.ms-excel', [])).toBe(true);
    expect(mimeMatches(undefined, [])).toBe(true);
  });

  it('keeps only the listed classes', () => {
    const filter = parseMimeFilter('image,pdf');
    expect(mimeMatches('image/png', filter)).toBe(true);
    expect(mimeMatches('application/pdf', filter)).toBe(true);
    expect(mimeMatches('video/mp4', filter)).toBe(false);
    expect(mimeMatches('application/msword', filter)).toBe(false);
  });
});

describe('toGalleryImage', () => {
  it('maps the storage path, not the download url', () => {
    const doc = {
      okey: 'doc1', title: 'Regatta', altText: 'boats',
      fullPath: 'tenant/p13/2024/regatta.jpg', url: 'https://firebasestorage/download?token=x'
    } as DocumentModel;

    expect(toGalleryImage(doc)).toEqual({
      ...IMAGE_CONFIG_SHAPE,
      label: 'Regatta',
      url: 'tenant/p13/2024/regatta.jpg',
      altText: 'boats',
      documentKey: 'doc1'
    });
  });
});
