import { AccountModel } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

export interface FlatAccountNode {
  account: AccountModel;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export function isAccount(account: unknown, tenantId: string): account is AccountModel {
  return isType(account, new AccountModel(tenantId));
}

/*-------------------------- search index --------------------------------*/
export function getAccountIndex(account: AccountModel): string {
  return 'n:' + account.name + ' id:' + account.id;
}

export function getAccountIndexInfo(): string {
  return 'n:ame id:number';
}

/*-------------------------- tree --------------------------------*/
/**
 * Build a flat, ordered list of visible account nodes for tree display.
 * Only children of expanded nodes are included.
 * @param accounts flat list of all accounts
 * @param rootKey bkey of the root account to start from
 * @param expandedKeys set of bkeys that are currently expanded
 */
export function flattenAccountTree(
  accounts: AccountModel[],
  rootKey: string,
  expandedKeys: string[]
): FlatAccountNode[] {
  const nodes: FlatAccountNode[] = [];
  if (!rootKey) return nodes;

  const root = accounts.find(a => a.bkey === rootKey);
  if (!root) return nodes;

  function addNode(account: AccountModel, depth: number): void {
    const hasChildren = accounts.some(a => a.parentId === account.bkey);
    const isExpanded = expandedKeys.includes(account.bkey);
    nodes.push({ account, depth, hasChildren, isExpanded });
    if (isExpanded) {
      const children = accounts.filter(a => a.parentId === account.bkey);
      for (const child of children) {
        addNode(child, depth + 1);
      }
    }
  }

  addNode(root, 0);
  return nodes;
}
