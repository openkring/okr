import { describe, expect, it } from 'vitest';

import { applyRatingChange } from '@okr/content-learning-util';

import { docKeyOfRating, recomputeRatingAggregate } from './rating-aggregate';

describe('docKeyOfRating', () => {
  it('derives the doc key from a document parentKey', () => {
    expect(docKeyOfRating('document.abc123')).toBe('abc123');
  });
  it('ignores anything else', () => {
    expect(docKeyOfRating('person.abc')).toBeUndefined();
    expect(docKeyOfRating('document.')).toBeUndefined();
    expect(docKeyOfRating(undefined)).toBeUndefined();
    expect(docKeyOfRating(42)).toBeUndefined();
  });
});

describe('recomputeRatingAggregate', () => {
  it('create: counts and sums the stars', () => {
    expect(recomputeRatingAggregate([4])).toEqual({ count: 1, sum: 4 });
    expect(recomputeRatingAggregate([4, 5, 1])).toEqual({ count: 3, sum: 10 });
  });
  it('update replaces the old stars', () => {
    const before = recomputeRatingAggregate([4, 2]);
    const after = recomputeRatingAggregate([4, 5]); // the 2 became a 5
    expect(before).toEqual({ count: 2, sum: 6 });
    expect(after).toEqual({ count: 2, sum: 9 });
    // same result as the delta helper
    expect(applyRatingChange(before, 2, 5)).toEqual(after);
  });
  it('delete: the removed rating leaves the aggregate', () => {
    expect(recomputeRatingAggregate([4])).toEqual({ count: 1, sum: 4 });
    expect(recomputeRatingAggregate([])).toEqual({ count: 0, sum: 0 });
  });
  it('invalid stars are ignored', () => {
    expect(recomputeRatingAggregate([0, 6, 2.5, '3', null, undefined, 3])).toEqual({ count: 1, sum: 3 });
  });
  it('is idempotent: same input, same output', () => {
    const input = [5, 5, 3];
    expect(recomputeRatingAggregate(input)).toEqual(recomputeRatingAggregate(input));
  });
});
