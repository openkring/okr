import { describe, expect, it } from 'vitest';

import { dayFolderMatches, isArchiveOwner, isDriveId, pickDayFolder, splitDiaryMedia } from './list-diary-media';

const f = (name: string, mimeType: string, thumbnail = '') => ({ id: name, name, mimeType, thumbnail, webViewLink: 'w' });

describe('splitDiaryMedia', () => {
  it('splits images and videos from documents, sorted by name', () => {
    const r = splitDiaryMedia([
      f('b.jpg', 'image/jpeg'), f('a.heic', 'image/heic'), f('z.pdf', 'application/pdf'), f('m.mov', 'video/quicktime'),
      f('c.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ]);
    expect(r.images.map(x => x.name)).toEqual(['a.heic', 'b.jpg', 'm.mov']);
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


describe('isArchiveOwner', () => {
  it('is true only for the exact configured owner uid', () => {
    expect(isArchiveOwner('owner-uid', 'owner-uid')).toBe(true);
    expect(isArchiveOwner('some-other-admin-uid', 'owner-uid')).toBe(false);
  });

  it('is false for an unauthenticated or empty caller uid, and when the owner secret is unset', () => {
    expect(isArchiveOwner(undefined, 'owner-uid')).toBe(false);
    expect(isArchiveOwner('', 'owner-uid')).toBe(false);
    expect(isArchiveOwner('', '')).toBe(false);
  });
});

describe('pickDayFolder', () => {
  const folder = (id: string, name: string, parent = 'm10') => ({ id, name, parents: [parent] });
  // archive → 2020er → 2026 → 10 / 09; and an unrelated "10" under 2025
  const tree = {
    m10: { name: '10', parents: ['y2026'] },
    m09: { name: '09', parents: ['y2026'] },
    o10: { name: '10', parents: ['y2025'] },
    x: { name: 'Fotos', parents: ['y2026'] },
    y2026: { name: '2026', parents: ['dec'] },
    y2025: { name: '2025', parents: ['dec'] },
  };

  it('takes the one folder whose name starts with the date and sits under yyyy/MM', () => {
    expect(pickDayFolder('20261020', [folder('a1', '20261020moToteFische')], tree)).toBe('a1');
  });

  it('prefers a prefix match over a name that only contains the date', () => {
    const candidates = [folder('x1', 'Kopie 20261020mo'), folder('a1', '20261020mo')];
    expect(pickDayFolder('20261020', candidates, tree)).toBe('a1');
    expect(dayFolderMatches('20261020', candidates).map(f => f.id)).toEqual(['a1']);
  });

  it('disambiguates two matches by the month folder of the parent', () => {
    expect(pickDayFolder('20261020', [folder('a1', '20261020mo', 'm10'), folder('b2', '20261020mo', 'm09')], tree)).toBe('a1');
  });

  it('rejects a single candidate under the wrong month', () => {
    expect(pickDayFolder('20261020', [folder('a1', '20261020mo', 'm09')], tree)).toBe('');
    expect(pickDayFolder('20261020', [folder('a1', '20261020mo', 'x')], tree)).toBe('');
  });

  it('rejects the correct month under the wrong year', () => {
    expect(pickDayFolder('20261020', [folder('a1', '20261020mo', 'o10')], tree)).toBe('');
  });

  it('rejects a candidate whose parents are unknown', () => {
    expect(pickDayFolder('20261020', [folder('a1', '20261020mo')], {})).toBe('');
  });

  it('returns empty when the placement does not settle it', () => {
    expect(pickDayFolder('20261020', [folder('a1', '20261020mo', 'm10'), folder('b2', '20261020di', 'm10')], tree)).toBe('');
  });

  it('returns empty when no folder matches, or the id is not a Drive id', () => {
    expect(pickDayFolder('20261020', [], tree)).toBe('');
    expect(pickDayFolder('20261020', [folder('a1', '20261021di')], tree)).toBe('');
    expect(pickDayFolder('20261020', [folder("a' or '", '20261020mo')], tree)).toBe('');
  });
});
