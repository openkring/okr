import { describe, expect, it } from 'vitest';

import { planTrackerSplit } from './tracker-split.util';

describe('planTrackerSplit', () => {
  it('adds tracker to a tenant that has the Logbuch', () => {
    expect(planTrackerSplit(['calevent', 'trip'])).toEqual({ addBlocks: ['tracker'], enabledFeatures: ['calevent', 'trip', 'tracker'] });
  });

  it('leaves a tenant without the Logbuch alone', () => {
    expect(planTrackerSplit(['calevent'])).toEqual({ addBlocks: [] });
  });

  it('is idempotent', () => {
    expect(planTrackerSplit(['trip', 'tracker'])).toEqual({ addBlocks: [] });
  });

  it('leaves a legacy tenant without enabledFeatures alone', () => {
    expect(planTrackerSplit(undefined)).toEqual({ addBlocks: [] });
    expect(planTrackerSplit('trip')).toEqual({ addBlocks: [] });
  });

  it('ignores non-string entries', () => {
    expect(planTrackerSplit(['trip', 3])).toEqual({ addBlocks: ['tracker'], enabledFeatures: ['trip', 'tracker'] });
  });
});
