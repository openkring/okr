import { AccountModel } from '@okr/shared-models';
import { isProfitAndLossAccountId, isType } from '@okr/shared-util-core';

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
 * Which kinds of accounts the tree shows. Roots are always shown.
 * - group: a non-root account with children
 * - account: an account without children (a bookable leaf, see `leafAccounts`)
 */
export interface AccountTreeVisibility {
  showGroups: boolean;
  showAccounts: boolean;
}

/**
 * Build a flat, ordered list of visible account nodes for tree display.
 *
 * Without `visibility`, only children of expanded nodes are included (plain tree).
 *
 * With `visibility`, groups follow the expansion state (and are hidden entirely when `showGroups`
 * is false), while accounts — if `showAccounts` — are always shown, each under its deepest visible
 * group: a collapsed or hidden group pulls up the accounts of all its descendants. E.g. with group
 * 30 visible but 300/301 not, the accounts 3000, 3001, 3010, 3011 are listed directly under 30.
 * @param accounts flat list of all accounts
 * @param rootKey okey of the root account to start from
 * @param expandedKeys set of okeys that are currently expanded
 * @param visibility optional group/account filter
 */
export function flattenAccountTree(
  accounts: AccountModel[],
  rootKey: string,
  expandedKeys: string[],
  visibility?: AccountTreeVisibility
): FlatAccountNode[] {
  const nodes: FlatAccountNode[] = [];
  if (!rootKey) return nodes;

  const root = accounts.find(a => a.okey === rootKey);
  if (!root) return nodes;

  const childrenOf = (okey: string): AccountModel[] => accounts.filter(a => a.parentKey === okey);
  const isLeaf = (account: AccountModel): boolean => !accounts.some(a => a.parentKey === account.okey);

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

  // all leaves below `okey`, in tree order
  function descendantLeaves(okey: string): AccountModel[] {
    return childrenOf(okey).flatMap(child => isLeaf(child) ? [child] : descendantLeaves(child.okey));
  }

  function addFilteredGroup(group: AccountModel, depth: number, vis: AccountTreeVisibility): void {
    const children = childrenOf(group.okey);
    const hasChildGroups = vis.showGroups && children.some(c => !isLeaf(c));
    const isExpanded = hasChildGroups && expandedKeys.includes(group.okey);
    nodes.push({ account: group, depth, hasChildren: hasChildGroups, isExpanded });
    if (isExpanded) {
      for (const child of children) {
        if (!isLeaf(child)) {
          addFilteredGroup(child, depth + 1, vis);
        } else if (vis.showAccounts) {
          nodes.push({ account: child, depth: depth + 1, hasChildren: false, isExpanded: false });
        }
      }
    } else if (vis.showAccounts) {
      for (const leaf of descendantLeaves(group.okey)) {
        nodes.push({ account: leaf, depth: depth + 1, hasChildren: false, isExpanded: false });
      }
    }
  }

  if (visibility) {
    addFilteredGroup(root, 0, visibility);
  } else {
    addNode(root, 0);
  }
  return nodes;
}

/**
 * Flatten every root account (chart of accounts) of the current accounting tenant into a
 * single ordered node list. The root is no longer selected via a dropdown — all roots for
 * the accountingTenantId in the URL are shown at the top level.
 * @param accounts flat list of all accounts
 * @param expandedKeys set of okeys that are currently expanded
 * @param visibility optional group/account filter, see `flattenAccountTree`
 */
export function flattenAccountForest(
  accounts: AccountModel[],
  expandedKeys: string[],
  visibility?: AccountTreeVisibility
): FlatAccountNode[] {
  return accounts
    .filter(a => a.type === 'root')
    .flatMap(root => flattenAccountTree(accounts, root.okey, expandedKeys, visibility));
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

/*-------------------------- parent selection --------------------------------*/
/** Every key below `okey` (children, grandchildren, …) — the accounts that may never become its parent. */
export function accountDescendantKeys(accounts: AccountModel[], okey: string): string[] {
  const keys: string[] = [];
  function walk(parentKey: string): void {
    for (const child of accounts.filter(a => a.parentKey === parentKey)) {
      keys.push(child.okey);
      walk(child.okey);
    }
  }
  if (okey) walk(okey);
  return keys;
}

/**
 * The accounts that may be picked as the Hauptkonto of `account`: the charts of accounts (root)
 * and the groups — a leaf is booked on, it never carries children. The account itself and its
 * descendants are excluded, otherwise the tree could be bent into a cycle and would vanish from
 * the list (flattenAccountForest only walks down from the roots).
 */
export function parentCandidates(accounts: AccountModel[], account: AccountModel): AccountModel[] {
  const blocked = new Set([account.okey, ...accountDescendantKeys(accounts, account.okey)]);
  return accounts
    .filter(a => (a.type === 'root' || a.type === 'group') && !blocked.has(a.okey))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The account itself plus every account below it — exactly what a delete cascades over. */
export function accountSubtree(accounts: AccountModel[], okey: string): AccountModel[] {
  const keys = new Set([okey, ...accountDescendantKeys(accounts, okey)]);
  return accounts.filter(a => keys.has(a.okey));
}

/** The account numbers already taken within the chart, ignoring the account being edited. */
export function usedAccountIds(accounts: AccountModel[], account: AccountModel): string[] {
  return accounts
    .filter(a => a.okey !== account.okey && a.id.length > 0)
    .map(a => a.id);
}

/** Balance-sheet accounts (numbers 1xxx/2xxx) never carry a default Kostenstelle: a stale key on a renumbered account is dropped. */
export function withCostCenterForAccountId(account: AccountModel): AccountModel {
  if (isProfitAndLossAccountId(account.id) || !account.costCenterKey) return account;
  return { ...account, costCenterKey: '' };
}
