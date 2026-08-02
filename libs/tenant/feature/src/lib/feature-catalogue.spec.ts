import { describe, expect, it } from 'vitest';
import { collectMenuUrls, composeFeatureRoutes, urlResolves } from '@okr/tenant-util';
import { FEATURE_CATALOGUE } from './feature-catalogue';

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    const routes = composeFeatureRoutes(FEATURE_CATALOGUE);
    const unresolved = collectMenuUrls(FEATURE_CATALOGUE).filter(u => !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});
