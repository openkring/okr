import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

// Direct CanActivateFn (NOT a factory): registered bare as `canActivate: [isTreasurerGuard]`.
// hasRole('treasurer', ...) resolves to treasurer OR admin (see auth.util.ts), matching the
// firestore.rules write permission on the ocr-rules collection.
export const isTreasurerGuard: CanActivateFn = () =>
  hasRole('treasurer', inject(AppStore).currentUser());
