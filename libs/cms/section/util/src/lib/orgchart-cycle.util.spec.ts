import { describe, expect, it } from 'vitest';

import { isOrgchartBlocked, MAX_ORGCHART_DEPTH, nextOrgchartVisitedKeys } from './orgchart-cycle.util';

describe('nextOrgchartVisitedKeys', () => {
  it('appends the current okey to the path', () => {
    expect([...nextOrgchartVisitedKeys(new Set(['root']), 'a')]).toEqual(['root', 'a']);
  });
  it('does not mutate the input set', () => {
    const input = new Set(['root']);
    nextOrgchartVisitedKeys(input, 'a');
    expect([...input]).toEqual(['root']);
  });
});

describe('isOrgchartBlocked', () => {
  it('detects a self-parented group (parentKey === own okey) immediately', () => {
    const path = nextOrgchartVisitedKeys(new Set<string>(), 'A');
    expect(isOrgchartBlocked(path, 'A', 0)).toBe(true);
  });

  it('detects a mutual-parent cycle A → B → A', () => {
    const pathAtA = nextOrgchartVisitedKeys(new Set<string>(), 'A');
    expect(isOrgchartBlocked(pathAtA, 'B', 0)).toBe(false);
    const pathAtB = nextOrgchartVisitedKeys(pathAtA, 'B');
    expect(isOrgchartBlocked(pathAtB, 'A', 1)).toBe(true);
  });

  it('caps nesting depth at MAX_ORGCHART_DEPTH regardless of cycles', () => {
    expect(isOrgchartBlocked(new Set(), 'fresh', MAX_ORGCHART_DEPTH - 1)).toBe(false);
    expect(isOrgchartBlocked(new Set(), 'fresh', MAX_ORGCHART_DEPTH)).toBe(true);
  });
});
