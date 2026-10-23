import { applyRatingChange, averageStars, isValidRating } from './learning-rating';

describe('applyRatingChange', () => {
  it('adds a new rating', () => {
    expect(applyRatingChange({ count: 2, sum: 7 }, undefined, 4)).toEqual({ count: 3, sum: 11 });
  });
  it('changes a rating', () => {
    expect(applyRatingChange({ count: 2, sum: 7 }, 3, 5)).toEqual({ count: 2, sum: 9 });
  });
  it('removes a rating', () => {
    expect(applyRatingChange({ count: 2, sum: 7 }, 4, undefined)).toEqual({ count: 1, sum: 3 });
  });
  it('never goes negative', () => {
    expect(applyRatingChange({ count: 0, sum: 0 }, 4, undefined)).toEqual({ count: 0, sum: 0 });
  });
});

describe('averageStars', () => {
  it('is 0 without ratings', () => {
    expect(averageStars({})).toBe(0);
    expect(averageStars({ ratingCount: 0, ratingSum: 0 })).toBe(0);
  });
  it('rounds to one decimal', () => {
    expect(averageStars({ ratingCount: 3, ratingSum: 11 })).toBe(3.7);
    expect(averageStars({ ratingCount: 2, ratingSum: 9 })).toBe(4.5);
  });
});

describe('isValidRating', () => {
  it('accepts integers 1..5 only', () => {
    expect([1, 3, 5].every(isValidRating)).toBe(true);
    expect([0, 6, 2.5, NaN, '3', null, undefined].some(isValidRating)).toBe(false);
  });
  it('applyRatingChange ignores invalid values', () => {
    expect(applyRatingChange({ count: 2, sum: 7 }, undefined, 9)).toEqual({ count: 2, sum: 7 });
    expect(applyRatingChange({ count: 2, sum: 7 }, 0, 4)).toEqual({ count: 3, sum: 11 });
    expect(applyRatingChange({ count: 2, sum: 7 }, 3, 2.5)).toEqual({ count: 1, sum: 4 });
  });
});
