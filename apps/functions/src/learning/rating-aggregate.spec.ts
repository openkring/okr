import { describe, expect, it } from 'vitest';

import { applyRatingChange } from '@okr/content-learning-util';

import { aggregateForDoc, docKeyOfRating, ratingDocKeysToRefresh, recomputeRatingAggregate } from './rating-aggregate';

describe('docKeyOfRating', () => {
  it('derives the doc key from a document parentKey', () => {
    expect(docKeyOfRating('document.abc123')).toBe('abc123');
  });
  it('ignores anything else', () => {
    expect(docKeyOfRating('person.abc')).toBeUndefined();
    expect(docKeyOfRating('document.')).toBeUndefined();
    expect(docKeyOfRating(undefined)).toBeUndefined();
    expect(docKeyOfRating(42)).toBeUndefined();
    expect(docKeyOfRating('document.a.b')).toBeUndefined();
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

describe('ratingDocKeysToRefresh', () => {
  it('deduplicates before and after', () => {
    expect(ratingDocKeysToRefresh({ parentKey: 'document.a' }, { parentKey: 'document.a' })).toEqual(['a']);
  });
  it('refreshes both docs when a rating moved', () => {
    expect(ratingDocKeysToRefresh({ parentKey: 'document.a' }, { parentKey: 'document.b' })).toEqual(['a', 'b']);
  });
  it('covers create and delete', () => {
    expect(ratingDocKeysToRefresh(undefined, { parentKey: 'document.a' })).toEqual(['a']);
    expect(ratingDocKeysToRefresh({ parentKey: 'document.a' }, undefined)).toEqual(['a']);
  });
  it('returns nothing without a usable key', () => {
    expect(ratingDocKeysToRefresh(undefined, undefined)).toEqual([]);
    expect(ratingDocKeysToRefresh({ parentKey: 'person.x' }, { parentKey: '' })).toEqual([]);
  });
});

describe('aggregateForDoc', () => {
  const doc = { tenants: ['scs'] };
  it('missing doc is a no-op', () => {
    expect(aggregateForDoc(undefined, [{ tenants: ['scs'], stars: 5 }])).toBeUndefined();
  });
  it('a foreign-tenant rating is ignored', () => {
    expect(aggregateForDoc(doc, [{ tenants: ['scs'], stars: 4 }, { tenants: ['other'], stars: 5 }])).toEqual({ count: 1, sum: 4 });
  });
  it('a doc without the room folder is still counted (tenant-level gate)', () => {
    expect(aggregateForDoc({ tenants: ['scs'] }, [{ tenants: ['scs'], stars: 3 }])).toEqual({ count: 1, sum: 3 });
  });
  it('archived ratings and invalid stars are ignored; no ratings gives zero', () => {
    expect(aggregateForDoc(doc, [{ tenants: ['scs'], stars: 4, isArchived: true }, { tenants: ['scs'], stars: 9 }])).toEqual({ count: 0, sum: 0 });
    expect(aggregateForDoc(doc, [])).toEqual({ count: 0, sum: 0 });
  });
});
