import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrgModel } from '@bk2/shared-models';
import { newOrgFormModel, convertOrgToForm, convertFormToOrg, createNewOrgFormModel, convertFormToNewOrg } from './org.util';
import { OrgFormModel } from './org-form.model';
import { OrgNewFormModel } from './org-new-form.model';

// Mock any problematic external dependencies to isolate the test
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));
vi.mock('@bk2/shared-util-angular', () => ({
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
}));

describe('Org Utils', () => {
  const tenantId = 'tenant-1';
  let org: OrgModel;

  beforeEach(() => {
    org = new OrgModel(tenantId);
    org.bkey = 'org-key-1';
    org.name = 'Test Org';
    org.bexioId = 'TO1';
    org.tags = 'test,org';
    org.notes = 'Some notes about the org.';
  });

  describe('OrgFormModel functions', () => {
    it('newOrgFormModel should return a default form model', () => {
      const formModel = newOrgFormModel();
      expect(formModel.name).toBe('');
    });

    it('convertOrgToForm should convert an OrgModel to an OrgFormModel', () => {
      const formModel = convertOrgToForm(org);
      expect(formModel.bkey).toBe('org-key-1');
      expect(formModel.name).toBe('Test Org');
      expect(formModel.tags).toBe('test,org');
    });

    it('convertOrgToForm should return an empty object if org is undefined', () => {
      const formModel = convertOrgToForm();
      expect(formModel).toEqual({});
    });

    it('convertFormToOrg should update an existing OrgModel', () => {
      const formModel: OrgFormModel = {
        bkey: 'org-key-1',
        name: 'Updated Org Name',
        tags: 'updated,tags',
        notes: 'Updated notes.',
      };
      const updatedOrg = convertFormToOrg(org, formModel, tenantId);
      expect(updatedOrg.name).toBe('Updated Org Name');
      expect(updatedOrg.tags).toBe('updated,tags');
      expect(updatedOrg.bkey).toBe('org-key-1'); // Should not be changed
    });

    it('convertFormToOrg should create a new OrgModel if one is not provided', () => {
      const formModel: OrgFormModel = { name: 'New Org' };
      const newOrg = convertFormToOrg(undefined, formModel, tenantId);
      expect(newOrg).toBeInstanceOf(OrgModel);
      expect(newOrg.name).toBe('New Org');
      expect(newOrg.tenants[0]).toBe(tenantId);
    });
  });

  describe('OrgNewFormModel functions', () => {
    it('createNewOrgFormModel should return a default new-org form model', () => {
      const formModel = createNewOrgFormModel();
      expect(formModel.name).toBe('');
    });

    it('convertFormToNewOrg should create a new OrgModel from a OrgNewFormModel', () => {
      const formModel: OrgNewFormModel = {
        name: 'Brand New Org',
        bexioId: 'BNO1',
        notes: 'Notes for the new org',
      };
      const newOrg = convertFormToNewOrg(formModel, tenantId);
      expect(newOrg).toBeInstanceOf(OrgModel);
      expect(newOrg.bkey).toBe('');
      expect(newOrg.name).toBe('Brand New Org');
      expect(newOrg.tenants[0]).toBe(tenantId);
    });
  });
});
