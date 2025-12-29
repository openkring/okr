import { describe, vi, beforeEach } from 'vitest';
import { PersonModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});
// Mock any problematic external dependencies to isolate the test
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));
vi.mock('@bk2/shared-util-angular', () => ({
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
  formatAhv: vi.fn((ssnId, format) => `formatted:${ssnId}:${format}`),
  AhvFormat: {
    Friendly: 'friendly',
    Electronic: 'electronic',
  },
}));

describe('Person Utils', () => {
  const tenantId = 'tenant-1';
  let person: PersonModel;

  beforeEach(() => {
    vi.clearAllMocks();
    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'John';
    person.lastName = 'Doe';
    person.gender = 'male';
    person.dateOfBirth = '19900101';
    person.ssnId = '123.4567.8901.23';
    person.notes = 'Some notes';
  });
});
