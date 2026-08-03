import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from '@okr/tenant-util';
import { FEATURE_ROUTES } from './feature-catalogue';

/**
 * Guards the metadata/route split (task 8b, repo owner ruling 2026-08-02): `FEATURE_BLOCKS`
 * (`@okr/tenant-util`, Angular-free) and `FEATURE_ROUTES` (`@okr/tenant-routes`, owns the
 * `canActivate`/`loadComponent` route table) are joined by `id` and MUST be kept in sync by
 * hand — nothing enforces the join at the type level, because the whole point of the split
 * is that the metadata half must not reference anything Angular-shaped. Drift here is a
 * silent bug: a metadata-only block is offered by the picker/callable but renders nowhere
 * (no route), or a route-only block is reachable by URL but never offered/audited/seeded.
 */
describe('catalogue metadata/route sync', () => {
  it('every metadata block has a matching route entry', () => {
    const routeIds = new Set(FEATURE_ROUTES.map(r => r.id));
    const missing = FEATURE_BLOCKS.map(b => b.id).filter(id => !routeIds.has(id));
    expect(missing).toEqual([]);
  });

  it('every route entry has a matching metadata block', () => {
    const blockIds = new Set(FEATURE_BLOCKS.map(b => b.id));
    const orphaned = FEATURE_ROUTES.map(r => r.id).filter(id => !blockIds.has(id));
    expect(orphaned).toEqual([]);
  });

  it('ids are unique on each side', () => {
    const blockIds = FEATURE_BLOCKS.map(b => b.id);
    const routeIds = FEATURE_ROUTES.map(r => r.id);
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(new Set(routeIds).size).toBe(routeIds.length);
  });
});
