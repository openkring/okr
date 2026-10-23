import {
  groupLearningPageKey, isLearningPage, learningConfigOf, learningItemUrl, learningRoomUrl, learningSlug,
  menuLearningPageKey, uniqueLearningSlug,
} from './learning-room';

describe('learning room keys', () => {
  it('group and menu page keys', () => {
    expect(groupLearningPageKey('g1')).toBe('g1_learning');
    expect(menuLearningPageKey('scs', 'rudern')).toBe('scs_learning_rudern');
  });

  it('urls', () => {
    expect(learningRoomUrl('scs_learning_rudern')).toBe('/private/scs_learning_rudern');
    expect(learningItemUrl('g1_learning', 'd1')).toBe('/private/learning-item/g1_learning/d1');
  });
});

describe('learningSlug', () => {
  it.each([
    ['Rudern', 'rudern'],
    ['J+S Kurse', 'j-s-kurse'],
    ['Übungen für Älteste', 'uebungen-fuer-aelteste'],
    ['  Café  ', 'cafe'],
    ['!!!', 'raum'],
    ['', 'raum'],
  ])('%s -> %s', (name, slug) => expect(learningSlug(name)).toBe(slug));

  it('caps the length without a trailing dash', () => {
    const slug = learningSlug('a'.repeat(39) + ' bbb');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueLearningSlug', () => {
  it('appends a counter while the key is taken', () => {
    expect(uniqueLearningSlug('Rudern', 'scs', [])).toBe('rudern');
    expect(uniqueLearningSlug('Rudern', 'scs', ['scs_learning_rudern', 'scs_learning_rudern-2'])).toBe('rudern-3');
  });
});

describe('isLearningPage', () => {
  it('requires type, not archived and the tenant', () => {
    expect(isLearningPage({ type: 'learning', tenants: ['scs'] }, 'scs')).toBe(true);
    expect(isLearningPage({ type: 'learning', tenants: ['scs'], isArchived: true }, 'scs')).toBe(false);
    expect(isLearningPage({ type: 'content', tenants: ['scs'] }, 'scs')).toBe(false);
    expect(isLearningPage({ type: 'learning', tenants: ['p13'] }, 'scs')).toBe(false);
    expect(isLearningPage(undefined)).toBe(false);
  });
});

describe('learningConfigOf', () => {
  const section = (over: Record<string, unknown> = {}) => ({
    okey: 's1', type: 'learning', tenants: ['scs'],
    properties: { folder: 'f1', topics: 'a,b', curators: [], defaultTab: 'videos' }, ...over,
  });

  it('takes the first learning section of the tenant with a folder', () => {
    const out = learningConfigOf([undefined, section({ type: 'article' }), section({ okey: 's2', properties: { folder: '' } }), section({ okey: 's3' })], 'scs');
    expect(out?.sectionKey).toBe('s3');
    expect(out?.config.folder).toBe('f1');
  });

  it('fills missing config fields', () => {
    const out = learningConfigOf([section({ properties: { folder: 'f1' } })], 'scs');
    expect(out?.config).toEqual({ folder: 'f1', topics: '', curators: [], defaultTab: 'files' });
  });

  it('ignores sections of another tenant', () => {
    expect(learningConfigOf([section({ tenants: ['p13'] })], 'scs')).toBeUndefined();
  });
});
