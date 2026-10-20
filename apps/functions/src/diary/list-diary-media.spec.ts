import { describe, expect, it } from 'vitest';

import { isDriveId, splitDiaryMedia } from './list-diary-media';

const f = (name: string, mimeType: string, thumbnail = '') => ({ id: name, name, mimeType, thumbnail, webViewLink: 'w' });

describe('splitDiaryMedia', () => {
  it('splits images from documents, sorted by name', () => {
    const r = splitDiaryMedia([
      f('b.jpg', 'image/jpeg'), f('a.heic', 'image/heic'), f('z.pdf', 'application/pdf'),
      f('c.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ]);
    expect(r.images.map(x => x.name)).toEqual(['a.heic', 'b.jpg']);
    expect(r.documents.map(x => x.name)).toEqual(['c.docx', 'z.pdf']);
  });

  it('drops the diary markdown and subfolders', () => {
    const r = splitDiaryMedia([f('20261011diary.md', 'text/markdown'), f('sub', 'application/vnd.google-apps.folder')]);
    expect(r).toEqual({ images: [], documents: [] });
  });

  it('keeps a document without thumbnail', () => {
    expect(splitDiaryMedia([f('x.zip', 'application/zip')]).documents[0].thumbnail).toBe('');
  });
});

describe('isDriveId', () => {
  it('accepts a Drive file id', () => expect(isDriveId('1AbC-d_EfGh2345678901234567890xyz')).toBe(true));
  it('rejects a quote that would break out of the Drive query', () => expect(isDriveId("x' or name contains '")).toBe(false));
  it('rejects a backslash and whitespace', () => {
    expect(isDriveId('a\\b')).toBe(false);
    expect(isDriveId('a b')).toBe(false);
  });
  it('rejects empty', () => expect(isDriveId('')).toBe(false));
});

