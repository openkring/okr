import { Injector, runInInjectionContext } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AppStore } from '@okr/shared-feature';

import { UNGATED_ROUTES } from './ungated-routes';

/** Does every guard of the route admit a user with these roles? (Roles is a flag map.) */
function admits(path: string, roles: Record<string, boolean>): boolean {
  const route = UNGATED_ROUTES.find(r => r.path === path);
  if (!route) throw new Error(`no route ${path}`);
  const injector = Injector.create({ providers: [{ provide: AppStore, useValue: { currentUser: () => ({ roles }) } }] });
  return (route.canActivate as CanActivateFn[]).every(guard =>
    runInInjectionContext(injector, () => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) === true);
}

describe('UNGATED_ROUTES guards', () => {
  it('billing/board admits an admin and a treasurer (the callables decide who is an operator)', () => {
    expect(admits('billing/board', { admin: true })).toBe(true);
    expect(admits('billing/board', { treasurer: true })).toBe(true);
  });
  it('billing/board refuses a privileged or registered user', () => {
    expect(admits('billing/board', { privileged: true })).toBe(false);
    expect(admits('billing/board', { registered: true })).toBe(false);
  });
  it('billing stays admin-only', () => {
    expect(admits('billing', { admin: true })).toBe(true);
    expect(admits('billing', { treasurer: true })).toBe(false);
  });
});
