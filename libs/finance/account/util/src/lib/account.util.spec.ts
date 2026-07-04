import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountModel } from '@okr/shared-models';
import * as coreUtils from '@okr/shared-util-core';
import { flattenAccountForest, flattenAccountTree, getAccountIndex, getDefaultExpandedKeys, isAccount } from './account.util';

vi.mock('@okr/shared-util-core', async importOriginal => {
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
    account.okey = 'acc-1';
    account.name = 'Assets';
    account.id = '1000';
    account.type = 'root';
    account.parentKey = '';
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
      root.okey = 'root-1';
      root.name = 'Root';
      root.type = 'root';
      root.parentKey = '';

      const group = new AccountModel(tenantId);
      group.okey = 'group-1';
      group.name = 'Group';
      group.type = 'group';
      group.parentKey = 'root-1';

      const leaf = new AccountModel(tenantId);
      leaf.okey = 'leaf-1';
      leaf.name = 'Leaf';
      leaf.type = 'leaf';
      leaf.parentKey = 'group-1';

      accounts = [root, group, leaf];
    });

    it('should return only the root when nothing is expanded', () => {
      const nodes = flattenAccountTree(accounts, rootKey, []);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].account.okey).toBe('root-1');
      expect(nodes[0].depth).toBe(0);
      expect(nodes[0].hasChildren).toBe(true);
      expect(nodes[0].isExpanded).toBe(false);
    });

    it('should show root and group when root is expanded', () => {
      const nodes = flattenAccountTree(accounts, rootKey, ['root-1']);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].account.okey).toBe('root-1');
      expect(nodes[0].isExpanded).toBe(true);
      expect(nodes[1].account.okey).toBe('group-1');
      expect(nodes[1].depth).toBe(1);
    });

    it('should show all three when root and group are expanded', () => {
      const nodes = flattenAccountTree(accounts, rootKey, ['root-1', 'group-1']);
      expect(nodes).toHaveLength(3);
      expect(nodes[2].account.okey).toBe('leaf-1');
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

  describe('forest helpers', () => {
    let accounts: AccountModel[];

    beforeEach(() => {
      const make = (okey: string, type: string, parentKey: string): AccountModel => {
        const a = new AccountModel(tenantId);
        a.okey = okey;
        a.name = okey;
        a.type = type;
        a.parentKey = parentKey;
        return a;
      };

      // two roots, each root -> one group (depth 1) -> one leaf (depth 2)
      accounts = [
        make('root-a', 'root', ''),
        make('group-a', 'group', 'root-a'),
        make('leaf-a', 'leaf', 'group-a'),
        make('root-b', 'root', ''),
        make('group-b', 'group', 'root-b'),
        make('leaf-b', 'leaf', 'group-b'),
      ];
    });

    describe('getDefaultExpandedKeys', () => {
      it('should expand roots and their direct children by default (2 tiers)', () => {
        const keys = getDefaultExpandedKeys(accounts);
        expect(keys).toEqual(['root-a', 'group-a', 'root-b', 'group-b']);
        expect(keys).not.toContain('leaf-a');
      });

      it('should expand only the roots when maxDepth is 1', () => {
        const keys = getDefaultExpandedKeys(accounts, 1);
        expect(keys).toEqual(['root-a', 'root-b']);
      });

      it('should return no keys when maxDepth is 0', () => {
        expect(getDefaultExpandedKeys(accounts, 0)).toHaveLength(0);
      });
    });

    describe('flattenAccountForest', () => {
      it('should include every root at the top level', () => {
        const nodes = flattenAccountForest(accounts, []);
        expect(nodes.map(n => n.account.okey)).toEqual(['root-a', 'root-b']);
        expect(nodes.every(n => n.depth === 0)).toBe(true);
      });

      it('should reveal children of expanded nodes across all roots', () => {
        const nodes = flattenAccountForest(accounts, getDefaultExpandedKeys(accounts));
        expect(nodes.map(n => n.account.okey)).toEqual([
          'root-a', 'group-a', 'leaf-a',
          'root-b', 'group-b', 'leaf-b',
        ]);
        expect(nodes.find(n => n.account.okey === 'leaf-a')?.depth).toBe(2);
      });

      it('should return an empty array when there are no roots', () => {
        const noRoots = accounts.filter(a => a.type !== 'root');
        expect(flattenAccountForest(noRoots, [])).toHaveLength(0);
      });
    });
  });
});
