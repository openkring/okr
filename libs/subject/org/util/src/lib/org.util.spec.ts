import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrgModel } from '@bk2/shared-models';
import { convertOrgToForm, convertFormToOrg, convertFormToNewOrg } from './org.util';
import { ORG_FORM_SHAPE } from './org-form.model';
import { ORG_NEW_FORM_SHAPE, OrgNewFormModel } from './org-new-form.model';

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
    it('convertOrgToForm should convert an OrgModel to an OrgFormModel', () => {
      const formModel = convertOrgToForm(org);
      expect(formModel!.bkey).toBe('org-key-1');
      expect(formModel!.name).toBe('Test Org');
      expect(formModel!.tags).toBe('test,org');
    });

    it('convertOrgToForm should return an empty object if org is undefined', () => {
      const formModel = convertOrgToForm();
      expect(formModel).toEqual({});
    });

    it('convertFormToOrg should update an existing OrgModel', () => {
      const formModel = ORG_FORM_SHAPE;
      formModel.bkey = 'org-key-1';
      formModel.name = 'Updated Org Name';
      formModel.tags = 'updated,tags';
      formModel.notes = 'Updated notes.';
      const updatedOrg = convertFormToOrg(formModel, org);
      expect(updatedOrg.name).toBe('Updated Org Name');
      expect(updatedOrg.tags).toBe('updated,tags');
      expect(updatedOrg.bkey).toBe('org-key-1'); // Should not be changed
    });

    it('convertFormToOrg should create a new OrgModel if one is not provided', () => {
      const formModel = ORG_FORM_SHAPE; 
      formModel.name = 'New Org';
      const newOrg = convertFormToOrg(formModel, undefined);
      expect(newOrg).toBeInstanceOf(OrgModel);
      expect(newOrg.name).toBe('New Org');
    });
  });

  describe('OrgNewFormModel functions', () => {
    it('createNewOrgFormModel should return a default new-org form model', () => {
      const formModel = ORG_NEW_FORM_SHAPE;
      expect(formModel.name).toBe('');
    });

    it('convertFormToNewOrg should create a new OrgModel from a OrgNewFormModel', () => {
      const formModel = ORG_NEW_FORM_SHAPE;
      formModel.name = 'Brand New Org';
      formModel.bexioId = 'BNO1';
      formModel.notes = 'Notes for the new org';
      
      const newOrg = convertFormToNewOrg(formModel, tenantId);
      expect(newOrg).toBeInstanceOf(OrgModel);
      expect(newOrg.bkey).toBe('');
      expect(newOrg.name).toBe('Brand New Org');
      expect(newOrg.tenants[0]).toBe(tenantId);
    });
  });
});
