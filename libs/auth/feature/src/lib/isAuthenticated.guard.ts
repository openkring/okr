import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppStore } from './app.store';

export const isAuthenticatedGuard = (): CanActivateFn => {
      return () => {    
        if (inject(AppStore).isAuthenticated() === true) return true;
        console.warn('isAuthenticatedGuard: not authenticated, redirecting to login')
        return inject(Router).parseUrl('/auth/login/bko');
      };
};
