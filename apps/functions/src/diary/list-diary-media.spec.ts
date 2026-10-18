import { describe, expect, it } from 'vitest';

import { splitDiaryMedia } from './list-diary-media';

const f = (name: string, mimeType: string, thumbnailLink = '') => ({ id: name, name, mimeType, thumbnailLink, webViewLink: 'w' });

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
    expect(splitDiaryMedia([f('x.zip', 'application/zip')]).documents[0].thumbnailLink).toBe('');
  });
});
