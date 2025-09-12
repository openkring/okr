import { describe, it, expect, vi, beforeEach } from 'vitest';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AccountModel, AccountType, GenderType, ModelType, OrgModel, OwnershipModel, Periodicity, PersonModel, ResourceModel, ResourceType, RowingBoatType } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { newOwnershipFormModel, convertOwnershipToForm, convertFormToOwnership, newOwnership, getOwnerName, isOwnership, getOwnershipSearchIndex, getOwnershipSearchIndexInfo } from './ownership.util';
import { OwnershipFormModel } from './ownership-form.model';

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
    ownership.ownerModelType = ModelType.Person;
    ownership.resourceKey = 'resource-1';
    ownership.resourceName = 'Boat';
    ownership.resourceModelType = ModelType.Resource;
    ownership.validFrom = '20230101';

    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'Jane';
    person.lastName = 'Doe';
    person.gender = GenderType.Female;

    org = new OrgModel(tenantId);
    org.bkey = 'org-1';
    org.name = 'Rowing Club';
    org.type = 'Club';

    resource = new ResourceModel(tenantId);
    resource.bkey = 'resource-1';
    resource.name = 'Single Scull';
    resource.type = ResourceType.RowingBoat;
    resource.subType = RowingBoatType.b1x;

    account = new AccountModel(tenantId);
    account.bkey = 'account-1';
    account.name = 'Club Fees';
    account.type = AccountType.Asset;
  });

  describe('newOwnershipFormModel', () => {
    it('should return a default form model', () => {
      const formModel = newOwnershipFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.validFrom).toBe('20250904');
      expect(formModel.validTo).toBe(END_FUTURE_DATE_STR);
      expect(formModel.ownerModelType).toBe(ModelType.Person);
      expect(formModel.price).toBe(0);
    });
  });

  describe('convertOwnershipToForm', () => {
    it('should convert an OwnershipModel to a form model', () => {
      const formModel = convertOwnershipToForm(ownership);
      expect(formModel.bkey).toBe('ownership-1');
      expect(formModel.ownerKey).toBe('person-1');
      expect(formModel.resourceName).toBe('Boat');
    });

    it('should return a new form model if ownership is undefined', () => {
      const formModel = convertOwnershipToForm(undefined);
      expect(formModel.bkey).toBe('');
      expect(formModel.validFrom).toBe('20250904');
    });
  });

  describe('convertFormToOwnership', () => {
    const formModel: OwnershipFormModel = {
      validFrom: '20240101',
      validTo: '20241231',
      price: 150,
      periodicity: Periodicity.Monthly,
      notes: 'New notes',
    } as OwnershipFormModel;

    it('should update an existing ownership model', () => {
      const updated = convertFormToOwnership(ownership, formModel, tenantId);
      expect(updated.validFrom).toBe('20240101');
      expect(updated.price).toBe(150);
      expect(updated.notes).toBe('New notes');
    });

    it('should create a new ownership model if one is not provided', () => {
      const created = convertFormToOwnership(undefined, formModel, tenantId);
      expect(created).toBeInstanceOf(OwnershipModel);
      expect(created.validFrom).toBe('20240101');
    });

    it('should call die if tenantId is not provided', () => {
      convertFormToOwnership(ownership, formModel, undefined);
      expect(mockDie).toHaveBeenCalledWith('ownership.util.convertFormToOwnership(): tenantId is mandatory.');
    });
  });

  describe('newOwnership', () => {
    it('should create a new ownership for a Person and a Resource', () => {
      mockIsPerson.mockReturnValue(true);
      mockIsResource.mockReturnValue(true);
      const result = newOwnership(person, resource, tenantId);
      expect(result.ownerKey).toBe('person-1');
      expect(result.ownerModelType).toBe(ModelType.Person);
      expect(result.ownerName1).toBe('Jane');
      expect(result.resourceKey).toBe('resource-1');
      expect(result.resourceModelType).toBe(ModelType.Resource);
      expect(result.resourceType).toBe(ResourceType.RowingBoat);
    });

    it('should create a new ownership for an Org and an Account', () => {
      mockIsPerson.mockReturnValue(false);
      mockIsResource.mockReturnValue(false);
      const result = newOwnership(org, account, tenantId);
      expect(result.ownerKey).toBe('org-1');
      expect(result.ownerModelType).toBe(ModelType.Org);
      expect(result.ownerName2).toBe('Rowing Club');
      expect(result.resourceKey).toBe('account-1');
      expect(result.resourceModelType).toBe(ModelType.Account);
      expect(result.resourceType).toBe(AccountType.Asset);
    });

    it('should call die if owner bkey is missing', () => {
      person.bkey = '';
      newOwnership(person, resource, tenantId);
      expect(mockDie).toHaveBeenCalledWith('ownership.util.newOwnership(): owner.bkey is mandatory.');
    });
  });

  describe('getOwnerName', () => {
    it('should return "firstName lastName" for a person', () => {
      ownership.ownerModelType = ModelType.Person;
      ownership.ownerName1 = 'John';
      ownership.ownerName2 = 'Doe';
      expect(getOwnerName(ownership)).toBe('John Doe');
    });

    it('should return "name" for an org', () => {
      ownership.ownerModelType = ModelType.Org;
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

  describe('Search Index functions', () => {
    it('getOwnershipSearchIndex should return a formatted index string', () => {
      const index = getOwnershipSearchIndex(ownership);
      expect(index).toBe('on:John Doe rn:Boat');
    });

    it('getOwnershipSearchIndexInfo should return the info string', () => {
      expect(getOwnershipSearchIndexInfo()).toBe('on:ownerName rn:resourceName');
    });
  });
});
