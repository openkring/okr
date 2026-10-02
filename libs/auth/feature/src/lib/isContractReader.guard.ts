import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

/**
 * Who may read the staff contract list (Vertragsverwaltung, spec 1.5 §5.1): treasurer, privileged
 * or auditor — `hasRole` adds admin to each of them. The one copy of this rule: the guard below and
 * `ContractStore` (`@okr/business-contract-feature`) both call it.
 */
export function isContractReader(user: UserModel | undefined): boolean {
  return hasRole('treasurer', user) || hasRole('privileged', user) || hasRole('auditor', user);
}

/**
 * Direct CanActivateFn (NOT a factory), like isTreasurerGuard: registered bare as
 * `canActivate: [isContractReaderGuard]`.
 *
 * Lives here, not in `@okr/business-contract-feature`: the route table (`@okr/tenant-routes`) is
 * eager, and importing the guard from the contract barrel was measured (scs-app prod build,
 * 2026-10-02) to pull ContractList, ContractPage, ContractStore and ContractService into a chunk
 * `main` imports statically. The Firestore rules remain the real boundary; this only keeps the UI
 * from rendering a list the user would see empty.
 */
export const isContractReaderGuard: CanActivateFn = () => isContractReader(inject(AppStore).currentUser());
