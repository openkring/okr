import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS, collectMenuUrls, composeFeatureRoutes, urlResolves } from '@okr/tenant-util';
import { FEATURE_ROUTES } from './feature-catalogue';

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    const routes = composeFeatureRoutes(FEATURE_ROUTES);
    const unresolved = collectMenuUrls(FEATURE_BLOCKS).filter(u => !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});
