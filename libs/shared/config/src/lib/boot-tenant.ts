import { Provider } from '@angular/core';
import { ENV, OkrEnvironment, TenantMode } from './env';

/**
 * Which tenant this app start serves (spec 1.179, phase 1).
 *
 * A tenant app is built for one tenant (`environment.tenantId`, mode `fixed`) and nothing on the
 * device can change that. A `runtime` build (the iOS portal) takes the tenant the person chose,
 * stored under {@link PORTAL_TENANT_KEY}. Switching tenant reloads the app, so the tenant is
 * constant for one app start and is resolved once, before bootstrap: `ENV.tenantId` stays a plain
 * value and none of its readers change.
 */
export const PORTAL_TENANT_KEY = 'okr.portal.tenantId';

/** The id ends up in asset URLs and Firestore queries: lower-case letters and digits only. */
export const TENANT_ID_PATTERN = /^[a-z][a-z0-9]{1,30}$/;

export function isValidTenantId(id: unknown): id is string {
  return typeof id === 'string' && TENANT_ID_PATTERN.test(id);
}

/** The stored tenant choice, or null when storage is missing, blocked, empty or holds an invalid id. */
export function readStoredTenant(storage: Pick<Storage, 'getItem'> | undefined): string | null {
  if (!storage) return null;
  try {
    const id = storage.getItem(PORTAL_TENANT_KEY);
    return isValidTenantId(id) ? id : null;
  } catch {
    return null;
  }
}

export function resolveBootTenant(env: OkrEnvironment, mode: TenantMode, stored: string | null): string {
  if (mode === 'runtime' && isValidTenantId(stored)) return stored;
  return env.tenantId;
}

const bootCache = new WeakMap<OkrEnvironment, OkrEnvironment>();

/** Reading the `localStorage` property itself throws where site data is blocked (SecurityError). */
function localStorageOrUndefined(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The environment of this app start. Fixed mode returns `env` itself; runtime mode returns a copy
 * with `tenantId` and `appId` set to the stored choice, computed once per `env` object so that
 * `main.ts` and `app.config.ts` see the same tenant.
 */
export function bootEnvironment(env: OkrEnvironment, mode: TenantMode = 'fixed'): OkrEnvironment {
  if (mode === 'fixed') return env;
  const cached = bootCache.get(env);
  if (cached) return cached;
  const tenantId = resolveBootTenant(env, mode, readStoredTenant(localStorageOrUndefined()));
  const result: OkrEnvironment = { ...env, tenantId, appId: tenantId };
  bootCache.set(env, result);
  return result;
}

/**
 * Reads `?tenant=<id>` from the address (a tenant's link into the portal, spec 1.179 §6.2). A valid
 * id different from the stored one is stored and reported as a change; the caller then reloads
 * `cleanUrl` (the address without the parameter, `null` when there was none). An invalid id is
 * dropped. Only for runtime-mode builds: a fixed build never calls it.
 */
export function consumeTenantQueryParam(
  loc: Pick<Location, 'href'>,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): { changed: boolean; cleanUrl: string | null } {
  const url = new URL(loc.href);
  if (!url.searchParams.has('tenant')) return { changed: false, cleanUrl: null };
  const id = url.searchParams.get('tenant');
  url.searchParams.delete('tenant');
  const cleanUrl = url.toString();
  if (!isValidTenantId(id) || id === readStoredTenant(storage)) return { changed: false, cleanUrl };
  try {
    storage.setItem(PORTAL_TENANT_KEY, id);
  } catch {
    return { changed: false, cleanUrl };
  }
  return { changed: true, cleanUrl };
}

export function provideBootEnv(env: OkrEnvironment, mode: TenantMode = 'fixed'): Provider {
  return { provide: ENV, useValue: bootEnvironment(env, mode) };
}
