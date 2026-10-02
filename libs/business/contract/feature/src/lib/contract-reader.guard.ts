import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

/**
 * Who may open the staff contract list and a contract's detail page (spec 1.5 §5.1):
 * treasurer, privileged or auditor — `hasRole` adds admin to each of them.
 *
 * Direct CanActivateFn (NOT a factory), like isTreasurerGuard: registered bare as
 * `canActivate: [isContractReaderGuard]`. Kept free of heavy imports so the route table stays lean.
 * The Firestore rules remain the real boundary; this only keeps the UI from rendering a list the
 * user would see empty.
 */
export const isContractReaderGuard: CanActivateFn = () => {
  const user = inject(AppStore).currentUser();
  return hasRole('treasurer', user) || hasRole('privileged', user) || hasRole('auditor', user);
};
