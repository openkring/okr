import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarInfo, DefaultResourceInfo, ModelType, OrgModel, Periodicity, PersonModel, ResourceInfo, ResourceModel, TransferModel, TransferState, TransferType } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { newTransferFormModel, convertTransferToForm, convertFormToTransfer, isTransfer, getName, getTransferSearchIndex, getTransferSearchIndexInfo } from './transfer.util';
import { TransferFormModel } from './transfer-form.model';

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
  const mockGetTodayStr = vi.mocked(coreUtils.getTodayStr);
  const mockGetAvatarInfoArray = vi.mocked(coreUtils.getAvatarInfoArray);
  const mockGetAvatarNames = vi.mocked(coreUtils.getAvatarNames);
  const mockGetAvatarKeys = vi.mocked(coreUtils.getAvatarKeys);

  const tenantId = 'tenant-1';
  let transfer: TransferModel;
  let person: PersonModel;
  let org: OrgModel;
  let resource: ResourceModel;
  let subjectAvatar: AvatarInfo[];
  let objectAvatar: AvatarInfo[];
  let resourceInfo: ResourceInfo;

  beforeEach(() => {
    vi.clearAllMocks();

    person = new PersonModel(tenantId);
    org = new OrgModel(tenantId);
    resource = new ResourceModel(tenantId);
    resource.bkey = 'res-1';
    resource.name = 'Test Resource';

    subjectAvatar = [{ key: 'person-1', name: 'Subject Person', modelType: ModelType.Person }];
    objectAvatar = [{ key: 'org-1', name: 'Object Org', modelType: ModelType.Org }];
    resourceInfo = { key: 'res-1', name: 'Test Resource', type: resource.type, subType: resource.subType };

    transfer = new TransferModel(tenantId);
    transfer.bkey = 'transfer-1';
    transfer.name = 'Initial Transfer';
    transfer.subjects = subjectAvatar;
    transfer.objects = objectAvatar;
    transfer.resource = resourceInfo;
    transfer.dateOfTransfer = '20240101';
  });

  describe('newTransferFormModel', () => {
    it('should return a default form model', () => {
      const formModel = newTransferFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.dateOfTransfer).toBe('20250904');
      expect(formModel.type).toBe(TransferType.Purchase);
      expect(formModel.state).toBe(TransferState.Initial);
      expect(formModel.resource).toEqual(DefaultResourceInfo);
    });

    it('should call getAvatarInfoArray for subject and object', () => {
      mockGetAvatarInfoArray.mockReturnValueOnce(subjectAvatar).mockReturnValueOnce(objectAvatar);
      const formModel = newTransferFormModel(person, ModelType.Person, org, ModelType.Org, resource);
      expect(mockGetAvatarInfoArray).toHaveBeenCalledWith(person, ModelType.Person);
      expect(mockGetAvatarInfoArray).toHaveBeenCalledWith(org, ModelType.Org);
      expect(formModel.subjects).toEqual(subjectAvatar);
      expect(formModel.objects).toEqual(objectAvatar);
      expect(formModel.resource.key).toBe('res-1');
    });
  });

  describe('convertTransferToForm', () => {
    it('should convert a TransferModel to a form model', () => {
      const formModel = convertTransferToForm(transfer);
      expect(formModel.bkey).toBe('transfer-1');
      expect(formModel.name).toBe('Initial Transfer');
      expect(formModel.subjects).toEqual(subjectAvatar);
      expect(formModel.resource).toEqual(resourceInfo);
    });

    it('should return a new form model if transfer is undefined', () => {
      const formModel = convertTransferToForm(undefined);
      expect(formModel.bkey).toBe('');
      expect(formModel.dateOfTransfer).toBe('20250904');
    });
  });

  describe('convertFormToTransfer', () => {
    const formModel: TransferFormModel = {
      name: 'Updated Transfer',
      dateOfTransfer: '20250101',
      price: 100,
      periodicity: Periodicity.Monthly,
    } as TransferFormModel;

    it('should update an existing transfer model', () => {
      const updated = convertFormToTransfer(transfer, formModel, tenantId);
      expect(updated.name).toBe('Updated Transfer');
      expect(updated.price).toBe(100);
      expect(updated.periodicity).toBe(Periodicity.Monthly);
    });

    it('should create a new transfer model if one is not provided', () => {
      const created = convertFormToTransfer(undefined, formModel, tenantId);
      expect(created).toBeInstanceOf(TransferModel);
      expect(created.name).toBe('Updated Transfer');
    });
  });

  describe('isTransfer', () => {
    it('should call isType with the correct parameters', () => {
      isTransfer({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(TransferModel));
    });
  });

  describe('getName', () => {
    it('should return "name1 name2" for a person', () => {
      expect(getName(ModelType.Person, 'John', 'Doe')).toBe('John Doe');
    });

    it('should return "name2" for an org', () => {
      expect(getName(ModelType.Org, '', 'The Org')).toBe('The Org');
    });
  });

  describe('Search Index functions', () => {
    it('getTransferSearchIndex should return a formatted index string', () => {
      mockGetAvatarNames.mockReturnValueOnce('Subject Person').mockReturnValueOnce('Object Org');
      mockGetAvatarKeys.mockReturnValueOnce('person-1').mockReturnValueOnce('org-1');

      const index = getTransferSearchIndex(transfer);

      expect(index).toBe('sn:Subject Person sk:person-1 on:Object Org ok:org-1 rn:Test Resource rk:res-1');
    });

    it('getTransferSearchIndexInfo should return the info string', () => {
      expect(getTransferSearchIndexInfo()).toBe('sn:subjectName sk:subjectKey ok:objectKey on:objectName rk:resourceKey rn:resourceName');
    });
  });
});
