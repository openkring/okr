import { describe, expect, it } from 'vitest';
import { DiaryAlbumModel } from '@okr/shared-models';
import { diaryAlbumValidations, diaryTripValidations } from './diary-album.validations';

const ref = { key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' } as const;

function album(kind: 'person' | 'location' | 'event', patch: Partial<DiaryAlbumModel> = {}): DiaryAlbumModel {
  return Object.assign(new DiaryAlbumModel('scs'), { kind, title: 'Titel' }, patch);
}

describe('diaryAlbumValidations', () => {
  it('rejects an empty title', () =>
    expect(diaryAlbumValidations(album('event', { title: '', slug: 'regatta' })).hasErrors('title')).toBe(true));
  it('rejects a slug with spaces', () =>
    expect(diaryAlbumValidations(album('event', { slug: 'Club Regatta' })).hasErrors('slug')).toBe(true));
  it('rejects an empty slug', () =>
    expect(diaryAlbumValidations(album('event', { slug: '' })).hasErrors('slug')).toBe(true));
  it('rejects a slug starting with a capital or digit', () => {
    expect(diaryAlbumValidations(album('event', { slug: 'Regatta' })).hasErrors('slug')).toBe(true);
    expect(diaryAlbumValidations(album('event', { slug: '1regatta' })).hasErrors('slug')).toBe(true);
  });
  it('accepts a valid event', () =>
    expect(diaryAlbumValidations(album('event', { slug: 'clubRegatta24' })).isValid()).toBe(true));
  it('requires a ref for person and location albums', () => {
    expect(diaryAlbumValidations(album('person')).hasErrors('ref')).toBe(true);
    expect(diaryAlbumValidations(album('location')).hasErrors('ref')).toBe(true);
  });
  it('accepts a person album with a ref and no slug', () =>
    expect(diaryAlbumValidations(album('person', { ref: { ...ref } })).isValid()).toBe(true));
  it('accepts a seeded slug outside the pattern on an existing album (the slug is read-only then)', () => {
    expect(diaryAlbumValidations(album('event', { okey: 'scs__u1__event__Anrudern', slug: 'Anrudern' })).isValid()).toBe(true);
    expect(diaryAlbumValidations(album('event', { okey: 'scs__u1__event__jass-abend', slug: 'jass-abend' })).isValid()).toBe(true);
  });
  it('rejects the same slugs on a new album', () => {
    expect(diaryAlbumValidations(album('event', { slug: 'Anrudern' })).hasErrors('slug')).toBe(true);
    expect(diaryAlbumValidations(album('event', { slug: 'jass-abend' })).hasErrors('slug')).toBe(true);
  });
  it('still requires a slug on an existing event album', () =>
    expect(diaryAlbumValidations(album('event', { okey: 'scs__u1__event__x', slug: '' })).hasErrors('slug')).toBe(true));
  it('does not ask an event for a ref', () =>
    expect(diaryAlbumValidations(album('event', { slug: 'x' })).hasErrors('ref')).toBe(false));
});

describe('diaryTripValidations', () => {
  const ok = { name: 'Italien', startDate: '20240301', endDate: '20240302' };
  it('accepts valid input', () => expect(diaryTripValidations(ok).isValid()).toBe(true));
  it('rejects an empty name', () => expect(diaryTripValidations({ ...ok, name: '' }).hasErrors('name')).toBe(true));
  it('rejects missing dates', () => {
    expect(diaryTripValidations({ ...ok, startDate: '' }).hasErrors('startDate')).toBe(true);
    expect(diaryTripValidations({ ...ok, endDate: '' }).hasErrors('endDate')).toBe(true);
  });
  it('rejects start after end on endDate', () =>
    expect(diaryTripValidations({ ...ok, startDate: '20240302', endDate: '20240301' }).hasErrors('endDate')).toBe(true));
  it('accepts a one-day trip', () =>
    expect(diaryTripValidations({ ...ok, endDate: '20240301' }).isValid()).toBe(true));
});
