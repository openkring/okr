import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

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
});
