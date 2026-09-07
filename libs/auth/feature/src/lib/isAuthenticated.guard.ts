import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { authState } from 'rxfire/auth';
import { map, take } from 'rxjs/operators';

import { AUTH } from '@okr/shared-config';

export const isAuthenticatedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AUTH);
  const router = inject(Router);
  
  // Wait for auth state to be determined
  return authState(auth).pipe(
    take(1), // Take the first emission (current auth state)
    map(user => {
      const isAuth = user !== null && user !== undefined;
      if (isAuth) return true;
      // Carry the route the user actually asked for through the login round-trip.
      // Without it, a deep link opened while signed out lands on the dashboard and
      // the link has to be pasted a second time. LoginPage reads it back and
      // validates it (getSafeReturnUrl) before navigating.
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
    })
  );
};
