import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountModel, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { newOwnership, getOwnerName, isOwnership } from './ownership.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
    isPerson: vi.fn(),
    isResource: vi.fn(),
    die: vi.fn(),
    getTodayStr: vi.fn().mockReturnValue('20250904'),
    addIndexElement: (index: string, key: string, value: string) => `${index} ${key}:${value}`.trim(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));

describe('Ownership Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const mockIsPerson = vi.mocked(coreUtils.isPerson);
  const mockIsResource = vi.mocked(coreUtils.isResource);
  const mockDie = vi.mocked(coreUtils.die);

  const tenantId = 'tenant-1';
  let ownership: OwnershipModel;
  let person: PersonModel;
  let org: OrgModel;
  let resource: ResourceModel;
  let account: AccountModel;

  beforeEach(() => {
    vi.clearAllMocks();

    ownership = new OwnershipModel(tenantId);
    ownership.bkey = 'ownership-1';
    ownership.ownerKey = 'person-1';
    ownership.ownerName1 = 'John';
    ownership.ownerName2 = 'Doe';
    ownership.ownerModelType = 'person';
    ownership.resourceKey = 'resource-1';
    ownership.resourceName = 'Boat';
    ownership.resourceModelType = 'resource';
    ownership.validFrom = '20230101';

    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'Jane';
    person.lastName = 'Doe';
    person.gender = 'female';

    org = new OrgModel(tenantId);
    org.bkey = 'org-1';
    org.name = 'Rowing Club';
    org.type = 'association';

    resource = new ResourceModel(tenantId);
    resource.bkey = 'resource-1';
    resource.name = 'Single Scull';
    resource.type = 'rboat';
    resource.subType = 'b1x';

    account = new AccountModel(tenantId);
    account.bkey = 'account-1';
    account.name = 'Club Fees';
    account.type = 'asset';
  });

  describe('newOwnership', () => {
    it('should create a new ownership for a Person and a Resource', () => {
      mockIsPerson.mockReturnValue(true);
      mockIsResource.mockReturnValue(true);
      const result = newOwnership(person, resource, tenantId);
      expect(result.ownerKey).toBe('person-1');
      expect(result.ownerModelType).toBe('person');
      expect(result.ownerName1).toBe('Jane');
      expect(result.resourceKey).toBe('resource-1');
      expect(result.resourceModelType).toBe('resource');
      expect(result.resourceType).toBe('rboat');
    });

    it('should create a new ownership for an Org and an Account', () => {
      mockIsPerson.mockReturnValue(false);
      mockIsResource.mockReturnValue(false);
      const result = newOwnership(org, account, tenantId);
      expect(result.ownerKey).toBe('org-1');
      expect(result.ownerModelType).toBe('org');
      expect(result.ownerName2).toBe('Rowing Club');
      expect(result.resourceKey).toBe('account-1');
      expect(result.resourceModelType).toBe('account');
      expect(result.resourceType).toBe('asset');
    });

    it('should call die if owner bkey is missing', () => {
      person.bkey = '';
      newOwnership(person, resource, tenantId);
      expect(mockDie).toHaveBeenCalledWith('ownership.util.newOwnership(): owner.bkey is mandatory.');
    });
  });

  describe('getOwnerName', () => {
    it('should return "firstName lastName" for a person', () => {
      ownership.ownerModelType = 'person';
      ownership.ownerName1 = 'John';
      ownership.ownerName2 = 'Doe';
      expect(getOwnerName(ownership)).toBe('John Doe');
    });

    it('should return "name" for an org', () => {
      ownership.ownerModelType = 'org';
      ownership.ownerName2 = 'The Big Company';
      expect(getOwnerName(ownership)).toBe('The Big Company');
    });
  });

  describe('isOwnership', () => {
    it('should call isType with the correct parameters', () => {
      isOwnership({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(OwnershipModel));
    });
  });
});
