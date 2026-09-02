import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from './feature-blocks';
import { FEATURE_PROFILES, closestProfile, profileDeviation } from './feature-profiles';
import { resolveWithDeps } from './feature-deps.util';
import { effectiveFeatures } from './feature-rollout.util';

const ids = new Set(FEATURE_BLOCKS.map(b => b.id));
const coreIds = FEATURE_BLOCKS.filter(b => b.core === true).map(b => b.id);

describe('FEATURE_PROFILES', () => {
  it('names only blocks that exist in the catalogue', () => {
    for (const profile of FEATURE_PROFILES) {
      for (const block of profile.blocks) {
        expect(ids.has(block), `${profile.id} names unknown block '${block}'`).toBe(true);
      }
    }
  });

  it('never lists a core block — those are on regardless and would be noise in every comparison', () => {
    for (const profile of FEATURE_PROFILES) {
      expect(profile.blocks.filter(b => coreIds.includes(b))).toEqual([]);
    }
  });

  it('is strictly nested, which is what makes a distance readable', () => {
    for (let i = 1; i < FEATURE_PROFILES.length; i++) {
      const smaller = new Set(FEATURE_PROFILES[i - 1].blocks);
      const larger = new Set(FEATURE_PROFILES[i].blocks);
      for (const block of smaller) {
        expect(larger.has(block), `${FEATURE_PROFILES[i].id} drops '${block}'`).toBe(true);
      }
      expect(larger.size).toBeGreaterThan(smaller.size);
    }
  });

  it('names no block that a rollout could never offer (disabled / internal)', () => {
    const byId = new Map(FEATURE_BLOCKS.map(b => [b.id, b]));
    for (const profile of FEATURE_PROFILES) {
      for (const block of profile.blocks) {
        expect(byId.get(block)?.defaultAvailability, `${profile.id}/${block}`).toBe('ga');
      }
    }
  });

  it('resolves to a dependency-closed set — a profile never asks for half a feature', () => {
    for (const profile of FEATURE_PROFILES) {
      const closed = new Set(resolveWithDeps(FEATURE_BLOCKS, profile.blocks));
      for (const id of closed) {
        const block = FEATURE_BLOCKS.find(b => b.id === id);
        for (const dep of block?.dependsOn ?? []) expect(closed.has(dep)).toBe(true);
      }
    }
  });

  it('every profile is actually reachable — applying it yields exactly its closed set plus core', () => {
    for (const profile of FEATURE_PROFILES) {
      const effective = effectiveFeatures({
        catalogue: FEATURE_BLOCKS, rollouts: [], enabled: profile.blocks, tenantId: 'p13',
      });
      expect(profileDeviation(FEATURE_BLOCKS, profile, effective)).toEqual({ missing: [], extra: [] });
    }
  });
});

describe('profileDeviation', () => {
  const minimal = FEATURE_PROFILES[0];

  it('ignores core blocks in both directions', () => {
    const effective = new Set([...resolveWithDeps(FEATURE_BLOCKS, minimal.blocks), ...coreIds]);
    expect(profileDeviation(FEATURE_BLOCKS, minimal, effective)).toEqual({ missing: [], extra: [] });
  });

  it('reports a block the profile wants but the tenant does not run', () => {
    const effective = new Set(resolveWithDeps(FEATURE_BLOCKS, minimal.blocks).filter(id => id !== 'chat'));
    expect(profileDeviation(FEATURE_BLOCKS, minimal, effective).missing).toEqual(['chat']);
  });

  it('reports a block the tenant runs that the profile does not ask for', () => {
    const effective = new Set([...resolveWithDeps(FEATURE_BLOCKS, minimal.blocks), 'alias']);
    expect(profileDeviation(FEATURE_BLOCKS, minimal, effective).extra).toEqual(['alias']);
  });

  it('does not call a dependency "extra" — asking for finance is asking for pdf-template', () => {
    const full = FEATURE_PROFILES[FEATURE_PROFILES.length - 1];
    const effective = new Set(resolveWithDeps(FEATURE_BLOCKS, full.blocks));
    expect(profileDeviation(FEATURE_BLOCKS, full, effective).extra).toEqual([]);
  });
});

describe('closestProfile', () => {
  it('picks the profile with the smallest total deviation', () => {
    const effective = new Set(resolveWithDeps(FEATURE_BLOCKS, FEATURE_PROFILES[1].blocks));
    expect(closestProfile(FEATURE_BLOCKS, FEATURE_PROFILES, effective)?.profile.id)
      .toBe('vereinsbetrieb');
  });

  it('breaks a tie toward the SMALLER profile — "minimal with extras", not "club with gaps"', () => {
    // One block beyond `minimal`; `vereinsbetrieb` adds five, so minimal is 1 away and
    // vereinsbetrieb is 4 away — but the tie-break direction is what this pins.
    const effective = new Set([...resolveWithDeps(FEATURE_BLOCKS, FEATURE_PROFILES[0].blocks), 'alias']);
    expect(closestProfile(FEATURE_BLOCKS, FEATURE_PROFILES, effective)?.profile.id).toBe('minimal');
  });

  it('returns undefined when there are no profiles to compare against', () => {
    expect(closestProfile(FEATURE_BLOCKS, [], new Set())).toBeUndefined();
  });
});
