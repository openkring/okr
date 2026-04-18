import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { flattenAccountTree, getAccountIndex, isAccount } from './account.util';

vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

describe('Account Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let account: AccountModel;

  beforeEach(() => {
    vi.clearAllMocks();
    account = new AccountModel(tenantId);
    account.bkey = 'acc-1';
    account.name = 'Assets';
    account.id = '1000';
    account.type = 'root';
    account.parentId = '';
  });

  describe('isAccount', () => {
    it('should return true when isType returns true', () => {
      mockIsType.mockReturnValue(true);
      expect(isAccount({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(AccountModel));
    });

    it('should return false when isType returns false', () => {
      mockIsType.mockReturnValue(false);
      expect(isAccount({}, tenantId)).toBe(false);
    });
  });

  describe('getAccountIndex', () => {
    it('should build index from name and id', () => {
      expect(getAccountIndex(account)).toBe('n:Assets id:1000');
    });

    it('should handle empty values', () => {
      const empty = new AccountModel(tenantId);
      expect(getAccountIndex(empty)).toBe('n: id:');
    });
  });

  describe('flattenAccountTree', () => {
    const rootKey = 'root-1';
    let accounts: AccountModel[];

    beforeEach(() => {
      const root = new AccountModel(tenantId);
      root.bkey = 'root-1';
      root.name = 'Root';
      root.type = 'root';
      root.parentId = '';

      const group = new AccountModel(tenantId);
      group.bkey = 'group-1';
      group.name = 'Group';
      group.type = 'group';
      group.parentId = 'root-1';

      const leaf = new AccountModel(tenantId);
      leaf.bkey = 'leaf-1';
      leaf.name = 'Leaf';
      leaf.type = 'leaf';
      leaf.parentId = 'group-1';

      accounts = [root, group, leaf];
    });

    it('should return only the root when nothing is expanded', () => {
      const nodes = flattenAccountTree(accounts, rootKey, []);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].account.bkey).toBe('root-1');
      expect(nodes[0].depth).toBe(0);
      expect(nodes[0].hasChildren).toBe(true);
      expect(nodes[0].isExpanded).toBe(false);
    });

    it('should show root and group when root is expanded', () => {
      const nodes = flattenAccountTree(accounts, rootKey, ['root-1']);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].account.bkey).toBe('root-1');
      expect(nodes[0].isExpanded).toBe(true);
      expect(nodes[1].account.bkey).toBe('group-1');
      expect(nodes[1].depth).toBe(1);
    });

    it('should show all three when root and group are expanded', () => {
      const nodes = flattenAccountTree(accounts, rootKey, ['root-1', 'group-1']);
      expect(nodes).toHaveLength(3);
      expect(nodes[2].account.bkey).toBe('leaf-1');
      expect(nodes[2].depth).toBe(2);
      expect(nodes[2].hasChildren).toBe(false);
    });

    it('should return empty array when rootKey is empty', () => {
      const nodes = flattenAccountTree(accounts, '', []);
      expect(nodes).toHaveLength(0);
    });

    it('should return empty array when rootKey is not found', () => {
      const nodes = flattenAccountTree(accounts, 'nonexistent', []);
      expect(nodes).toHaveLength(0);
    });
  });
});
