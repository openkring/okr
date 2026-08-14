import { AccountModel } from '@okr/shared-models';
import { isType } from '@okr/shared-util-core';

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

/** How many tiers of the account tree are expanded by default (root = tier 0). */
export const DEFAULT_EXPAND_DEPTH = 2;

/** Accounts that are not referenced as any other account's parentKey (i.e. bookable leaves). */
export function leafAccounts(accounts: AccountModel[]): AccountModel[] {
  const parents = new Set(accounts.map(a => a.parentKey).filter(k => !!k));
  return accounts.filter(a => !parents.has(a.okey));
}

/*-------------------------- tree --------------------------------*/
/**
 * Build a flat, ordered list of visible account nodes for tree display.
 * Only children of expanded nodes are included.
 * @param accounts flat list of all accounts
 * @param rootKey okey of the root account to start from
 * @param expandedKeys set of okeys that are currently expanded
 */
export function flattenAccountTree(
  accounts: AccountModel[],
  rootKey: string,
  expandedKeys: string[]
): FlatAccountNode[] {
  const nodes: FlatAccountNode[] = [];
  if (!rootKey) return nodes;

  const root = accounts.find(a => a.okey === rootKey);
  if (!root) return nodes;

  function addNode(account: AccountModel, depth: number): void {
    const hasChildren = accounts.some(a => a.parentKey === account.okey);
    const isExpanded = expandedKeys.includes(account.okey);
    nodes.push({ account, depth, hasChildren, isExpanded });
    if (isExpanded) {
      const children = accounts.filter(a => a.parentKey === account.okey);
      for (const child of children) {
        addNode(child, depth + 1);
      }
    }
  }

  addNode(root, 0);
  return nodes;
}

/**
 * Flatten every root account (chart of accounts) of the current accounting tenant into a
 * single ordered node list. The root is no longer selected via a dropdown — all roots for
 * the accountingTenantId in the URL are shown at the top level.
 * @param accounts flat list of all accounts
 * @param expandedKeys set of okeys that are currently expanded
 */
export function flattenAccountForest(
  accounts: AccountModel[],
  expandedKeys: string[]
): FlatAccountNode[] {
  return accounts
    .filter(a => a.type === 'root')
    .flatMap(root => flattenAccountTree(accounts, root.okey, expandedKeys));
}

/**
 * Collect the okeys that must be expanded so the tree renders `maxDepth` tiers deep by default.
 * A node at depth `d` is expanded (i.e. its children are revealed) when `d < maxDepth`, so with
 * the default of 2 the roots and their direct children are open, revealing everything down to
 * depth 2.
 * @param accounts flat list of all accounts
 * @param maxDepth number of tiers to reveal (root = depth 0)
 */
export function getDefaultExpandedKeys(
  accounts: AccountModel[],
  maxDepth: number = DEFAULT_EXPAND_DEPTH
): string[] {
  const keys: string[] = [];

  function walk(account: AccountModel, depth: number): void {
    if (depth >= maxDepth) return;
    keys.push(account.okey);
    for (const child of accounts.filter(a => a.parentKey === account.okey)) {
      walk(child, depth + 1);
    }
  }

  for (const root of accounts.filter(a => a.type === 'root')) {
    walk(root, 0);
  }
  return keys;
}
