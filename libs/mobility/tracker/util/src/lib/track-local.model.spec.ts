import { describe, expect, it } from 'vitest';
import { groupPointsBySection } from './track-local.model';

describe('groupPointsBySection', () => {
  it('returns [] for no rows', () => {
    expect(groupPointsBySection([])).toEqual([]);
  });

  it('groups by section and sorts each group by t', () => {
    const out = groupPointsBySection([
      { section: 1, lat: 3, lng: 3, t: 30, acc: null },
      { section: 0, lat: 2, lng: 2, t: 20, acc: 5 },
      { section: 1, lat: 4, lng: 4, t: 10 },
      { section: 0, lat: 1, lng: 1, t: 10 },
    ]);
    expect(out).toEqual([
      [{ lat: 1, lng: 1, t: 10 }, { lat: 2, lng: 2, t: 20, acc: 5 }],
      [{ lat: 4, lng: 4, t: 10 }, { lat: 3, lng: 3, t: 30 }],
    ]);
  });
});
