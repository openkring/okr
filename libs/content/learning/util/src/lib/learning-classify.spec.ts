import { learningTabOf, parseTopics } from './learning-classify';

describe('learningTabOf', () => {
  it.each([
    ['video/mp4', 'videos'],
    ['image/jpeg', 'images'],
    ['image/png', 'images'],
    ['image/svg+xml', 'files'],
    ['application/pdf', 'files'],
    ['', 'files'],
  ])('%s -> %s', (mime, tab) => expect(learningTabOf(mime)).toBe(tab));
});

describe('parseTopics', () => {
  it('trims, drops empties, keeps order, dedupes', () => {
    expect(parseTopics(' a, b ,, a,c ,')).toEqual(['a', 'b', 'c']);
  });
  it('handles empty input', () => {
    expect(parseTopics('')).toEqual([]);
  });
});
