import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { convertResourceToForm, convertFormToResource } from './resource.util';
import { ResourceFormModel } from './resource-form.model';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

describe('Resource Utils', () => {
  const tenantId = 'tenant-1';
  let resource: ResourceModel;

  beforeEach(() => {
    vi.clearAllMocks();
    resource = new ResourceModel(tenantId);
    resource.bkey = 'res-1';
    resource.name = 'My Document';
    resource.description = 'A test document';
    resource.tags = 'test,doc';
  });

  describe('convertResourceToForm', () => {
    it('should convert a ResourceModel to a ResourceFormModel', () => {
      const formModel = convertResourceToForm(resource);
      expect(formModel.bkey).toBe('res-1');
      expect(formModel.name).toBe('My Document');
    });
  });

  describe('convertFormToResource', () => {
    let formModel: ResourceFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'res-1',
        name: 'Updated Document',
        description: 'Updated description',
        tags: 'updated,tag',
      };
    });

    it('should update an existing ResourceModel from a form model', () => {
      const updatedResource = convertFormToResource(resource, formModel, tenantId);
      expect(updatedResource.name).toBe('Updated Document');
      expect(updatedResource.description).toBe('Updated description');
      expect(updatedResource.tags).toBe('updated,tag');
    });

    it('should create a new ResourceModel if one is not provided', () => {
      const newResource = convertFormToResource(undefined, formModel, tenantId);
      expect(newResource).toBeInstanceOf(ResourceModel);
      expect(newResource.name).toBe('Updated Document');
      expect(newResource.tenants[0]).toBe(tenantId);
    });
  });
});
