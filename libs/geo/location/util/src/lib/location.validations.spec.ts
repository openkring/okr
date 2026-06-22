import { describe, expect, it } from 'vitest';
import { LocationModel } from '@bk2/shared-models';

import { locationValidations } from './location.validations';

describe('locationValidations', () => {
  const tenantId = 'tenant-1';

  function makeLocation(): LocationModel {
    const location = new LocationModel(tenantId);
    location.bkey = 'loc-1';
    location.name = 'Main Office';
    location.type = 'address';
    return location;
  }

  it('does not flag an empty address', () => {
    expect(locationValidations(makeLocation(), tenantId, '').hasErrors('address')).toBe(false);
  });

  it('does not flag a normal address', () => {
    const model = makeLocation();
    model.address = 'Seestrasse 214, 8713 Stäfa, Switzerland';
    expect(locationValidations(model, tenantId, '').hasErrors('address')).toBe(false);
  });

  it('flags a non-string address', () => {
    const model = makeLocation();
    (model as unknown as { address: unknown }).address = 123;
    expect(locationValidations(model, tenantId, '').hasErrors('address')).toBe(true);
  });
});
