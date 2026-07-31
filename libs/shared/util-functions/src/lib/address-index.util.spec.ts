import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from 'firebase-admin/firestore';

import { AddressModel } from '@okr/shared-models';

import { getOwnerName, isIndexOnlyChange, syncAddressOwnerName, syncOwnerNameOnAddresses } from './address-index.util';

vi.mock('firebase-admin/firestore');
vi.mock('firebase-functions/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

describe('Address index owner segment', () => {
  const mockParentGet = vi.fn();
  const mockUpdate = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockParentGet, update: mockUpdate }));
  const mockGet = vi.fn();
  const mockWhere = vi.fn();
  const mockCollection = vi.fn(() => ({ doc: mockDoc, where: mockWhere, get: mockGet }));
  const firestore = { collection: mockCollection } as unknown as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ get: mockGet });
  });

  const address = (partial: Partial<AddressModel>): AddressModel =>
    ({ parentKey: 'person.p1', isArchived: false, index: '', ...partial } as AddressModel);

  describe('getOwnerName', () => {
    it('joins a person first and last name', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ firstName: 'Bruno', lastName: 'Kaiser' }) });
      expect(await getOwnerName(firestore, 'person.kaiser')).toBe('Bruno Kaiser');
    });

    it('uses the org name', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ name: 'Seeclub Stäfa' }) });
      expect(await getOwnerName(firestore, 'org.scs')).toBe('Seeclub Stäfa');
    });

    it('returns empty for a missing parent or an unknown prefix', async () => {
      mockParentGet.mockResolvedValue({ exists: false });
      expect(await getOwnerName(firestore, 'person.gone')).toBe('');
      expect(await getOwnerName(firestore, 'resource.r1')).toBe('');
      expect(await getOwnerName(firestore, '')).toBe('');
    });
  });

  describe('syncAddressOwnerName', () => {
    it('stamps the owner name onto the index', async () => {
      const a = address({ index: 'n:a@b.ch p:person.p1 o:' });
      expect(await syncAddressOwnerName(firestore, 'a1', a, 'Bruno Kaiser')).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({ index: 'n:a@b.ch p:person.p1 o:Bruno Kaiser' });
    });

    it('does not write when the index is already correct — this is what stops the recursion', async () => {
      const a = address({ index: 'n:a@b.ch p:person.p1 o:Bruno Kaiser' });
      expect(await syncAddressOwnerName(firestore, 'a1', a, 'Bruno Kaiser')).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('resolves the name itself when none is supplied', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ firstName: 'Bruno', lastName: 'Kaiser' }) });
      await syncAddressOwnerName(firestore, 'a1', address({ index: 'n:x p:person.p1' }));
      expect(mockUpdate).toHaveBeenCalledWith({ index: 'n:x p:person.p1 o:Bruno Kaiser' });
    });
  });

  describe('syncOwnerNameOnAddresses', () => {
    it('refreshes every address of the parent, archived ones included', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ firstName: 'Bruno', lastName: 'Meier' }) });
      mockGet.mockResolvedValue({
        docs: [
          { id: 'a1', data: () => address({ index: 'n:x p:person.p1 o:Bruno Kaiser' }) },
          { id: 'a2', data: () => address({ index: 'n:y p:person.p1 o:Bruno Kaiser', isArchived: true }) },
          { id: 'a3', data: () => address({ index: 'n:z p:person.p1 o:Bruno Meier' }) }, // already correct
        ],
      });

      expect(await syncOwnerNameOnAddresses(firestore, 'person.p1')).toBe(2);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      // the query must NOT filter on isArchived — the admin list can surface archived rows
      expect(mockWhere).toHaveBeenCalledWith('parentKey', '==', 'person.p1');
      expect(mockWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('isIndexOnlyChange', () => {
    it('detects our own write-back', () => {
      const before = address({ email: 'a@b.ch', index: 'n:a@b.ch p:person.p1 o:' });
      const after = address({ email: 'a@b.ch', index: 'n:a@b.ch p:person.p1 o:Bruno Kaiser' });
      expect(isIndexOnlyChange(before, after)).toBe(true);
    });

    it('does not swallow a real edit that also moved the index', () => {
      const before = address({ email: 'a@b.ch', index: 'n:a@b.ch p:person.p1 o:Bruno Kaiser' });
      const after = address({ email: 'c@d.ch', index: 'n:c@d.ch p:person.p1 o:Bruno Kaiser' });
      expect(isIndexOnlyChange(before, after)).toBe(false);
    });

    it('does not swallow an archive (the delete path)', () => {
      const before = address({ index: 'n:x p:person.p1 o:B K' });
      const after = address({ index: 'n:x p:person.p1 o:B K', isArchived: true });
      expect(isIndexOnlyChange(before, after)).toBe(false);
    });

    it('is insensitive to key order between the before and after snapshots', () => {
      const before = { parentKey: 'person.p1', email: 'a@b.ch', index: 'x' } as unknown as AddressModel;
      const after = { email: 'a@b.ch', index: 'y', parentKey: 'person.p1' } as unknown as AddressModel;
      expect(isIndexOnlyChange(before, after)).toBe(true);
    });
  });
});
