import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, OrgModel, OrgModelName, PersonModel, PersonModelName, ResourceModel, ResourceModelName, TransferModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { DEFAULT_GENDER, DEFAULT_ORG_TYPE, DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';

import { isTransfer, getName, getTransferIndexInfo, getTransferIndex } from './transfer.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
    getTodayStr: vi.fn().mockReturnValue('20250904'),
    getAvatarInfoArray: vi.fn(),
    getAvatarNames: vi.fn(),
    getAvatarKeys: vi.fn(),
    addIndexElement: (index: string, key: string, value: string) => `${index} ${key}:${value}`.trim(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));

describe('Transfer Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const mockGetAvatarNames = vi.mocked(coreUtils.getAvatarNames);
  const mockGetAvatarKeys = vi.mocked(coreUtils.getAvatarKeys);

  const tenantId = 'tenant-1';
  let transfer: TransferModel;
  let person: PersonModel;
  let org: OrgModel;
  let resource: ResourceModel;
  let subjectAvatar: AvatarInfo[];
  let objectAvatar: AvatarInfo[];
  let resourceInfo: AvatarInfo;

  beforeEach(() => {
    vi.clearAllMocks();

    person = new PersonModel(tenantId);
    org = new OrgModel(tenantId);
    resource = new ResourceModel(tenantId);
    resource.bkey = 'res-1';
    resource.name = 'Test Resource';

    subjectAvatar = [{ key: 'person-1', name1: '', name2: 'Subject Person', modelType: PersonModelName, type: DEFAULT_GENDER, subType: '', label: ''   }];
    objectAvatar = [{ key: 'org-1', name1: '', name2: 'Object Org', modelType: OrgModelName, type: DEFAULT_ORG_TYPE, subType: '', label: '' }];
    resourceInfo = { key: 'res-1', name1: '', name2: 'Test Resource', modelType: ResourceModelName, type: DEFAULT_RESOURCE_TYPE, subType: '', label: '' };

    transfer = new TransferModel(tenantId);
    transfer.bkey = 'transfer-1';
    transfer.name = 'Initial Transfer';
    transfer.subjects = subjectAvatar;
    transfer.objects = objectAvatar;
    transfer.resource = resourceInfo;
    transfer.dateOfTransfer = '20240101';
  });

  describe('isTransfer', () => {
    it('should call isType with the correct parameters', () => {
      isTransfer({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(TransferModel));
    });
  });

  describe('getName', () => {
    it('should return "name1 name2" for a person', () => {
      expect(getName(PersonModelName, 'John', 'Doe')).toBe('John Doe');
    });

    it('should return "name2" for an org', () => {
      expect(getName(OrgModelName, '', 'The Org')).toBe('The Org');
    });
  });

  describe('Search Index functions', () => {
    it('getTransferSearchIndex should return a formatted index string', () => {
      mockGetAvatarNames.mockReturnValueOnce('Subject Person').mockReturnValueOnce('Object Org');
      mockGetAvatarKeys.mockReturnValueOnce('person-1').mockReturnValueOnce('org-1');

      const index = getTransferIndex(transfer);

      expect(index).toBe('sn:Subject Person sk:person-1 on:Object Org ok:org-1 rn:Test Resource rk:res-1');
    });

    it('getTransferSearchIndexInfo should return the info string', () => {
      expect(getTransferIndexInfo()).toBe('sn:subjectName sk:subjectKey ok:objectKey on:objectName rk:resourceKey rn:resourceName');
    });
  });
});
