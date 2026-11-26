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
const TENANT_ID_PATTERN = /^[a-z][a-z0-9]{1,30}$/;

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

/**
 * The environment of this app start. Fixed mode returns `env` itself; runtime mode returns a copy
 * with `tenantId` and `appId` set to the stored choice, computed once per `env` object so that
 * `main.ts` and `app.config.ts` see the same tenant.
 */
export function bootEnvironment(env: OkrEnvironment, mode: TenantMode = 'fixed'): OkrEnvironment {
  if (mode === 'fixed') return env;
  const cached = bootCache.get(env);
  if (cached) return cached;
  const storage = typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  const tenantId = resolveBootTenant(env, mode, readStoredTenant(storage));
  const result: OkrEnvironment = { ...env, tenantId, appId: tenantId };
  bootCache.set(env, result);
  return result;
}

export function provideBootEnv(env: OkrEnvironment, mode: TenantMode = 'fixed'): Provider {
  return { provide: ENV, useValue: bootEnvironment(env, mode) };
}
