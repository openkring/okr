import { describe, expect, it } from 'vitest';
import { admissibleKeys, chunk, isElevated } from './mailing-recipients';

describe('isElevated', () => {
  it('accepts memberAdmin, privileged and admin', () => {
    expect(isElevated({ memberAdmin: true })).toBe(true);
    expect(isElevated({ privileged: true })).toBe(true);
    expect(isElevated({ admin: true })).toBe(true);
  });

  it('refuses everybody else', () => {
    expect(isElevated({ registered: true, groupAdmin: true })).toBe(false);
    expect(isElevated(undefined)).toBe(false);
  });
});

describe('admissibleKeys', () => {
  it('dedupes and drops empty keys', () => {
    expect(admissibleKeys(['a', '', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('keeps only group members for a group admin', () => {
    expect(admissibleKeys(['a', 'x', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('chunk', () => {
  it('splits into slices of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 30)).toEqual([]);
  });
});
