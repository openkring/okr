import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS, collectMenuUrls, composeFeatureRoutes, urlResolves } from '@okr/tenant-util';
import { FEATURE_ROUTES } from './feature-catalogue';
import { UNGATED_ROUTES } from './ungated-routes';

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    // UNGATED_ROUTES: catalogued menu rows may point at a control-plane screen that is
    // deliberately outside FEATURE_ROUTES (the feature picker). It still has to resolve.
    const routes = [...composeFeatureRoutes(FEATURE_ROUTES), ...UNGATED_ROUTES];
    const unresolved = collectMenuUrls(FEATURE_BLOCKS).filter(u => !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});
