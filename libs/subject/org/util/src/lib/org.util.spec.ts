import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrgModel } from '@bk2/shared-models';

// org.util imports address factories from @bk2/subject-address-util, which transitively pulls in
// @ionic/angular. Mock it so these pure-function tests don't load Ionic ES modules.
vi.mock('@bk2/subject-address-util', () => ({
  createFavoriteEmailAddress: vi.fn(),
  createFavoritePhoneAddress: vi.fn(),
  createFavoritePostalAddress: vi.fn(),
  createFavoriteWebAddress: vi.fn(),
}));

import { getOrgIndex, getOrgIndexInfo } from './org.util';

describe('Org Utils', () => {
  const tenantId = 'tenant-1';
  let org: OrgModel;

  beforeEach(() => {
    org = new OrgModel(tenantId);
    org.bkey = 'org-key-1';
    org.name = 'Test Org';
    org.type = 'association';
    org.favZipCode = '8000';
    org.dateOfFoundation = '19990101';
    org.tags = 'test,org';
  });

  describe('getOrgIndex', () => {
    it('builds an index from name, zip, type and dateOfFoundation', () => {
      expect(getOrgIndex(org)).toBe('n:Test Org z:8000 ot:association dof:19990101');
    });

    it('skips empty values', () => {
      org.favZipCode = '';
      expect(getOrgIndex(org)).toBe('n:Test Org ot:association dof:19990101');
    });
  });

  describe('getOrgIndexInfo', () => {
    it('describes the index structure', () => {
      expect(getOrgIndexInfo()).toBe('n:name z:zipCode ot:orgType dof:dateOfFoundation');
    });
  });
});
