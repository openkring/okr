import { describe, expect, it } from 'vitest';
import { ENV, OkrEnvironment } from './env';
import {
  bootEnvironment,
  consumeTenantQueryParam,
  isValidTenantId,
  PORTAL_TENANT_KEY,
  provideBootEnv,
  readStoredTenant,
  resolveBootTenant,
} from './boot-tenant';

const env = () => ({ tenantId: 'kring', appId: 'kring' }) as OkrEnvironment;
const store = (v: string | null) => ({ getItem: () => v });

describe('resolveBootTenant', () => {
  it('fixed mode ignores a stored tenant', () =>
    expect(resolveBootTenant(env(), 'fixed', 'scs')).toBe('kring'));

  it('runtime mode uses a valid stored tenant', () =>
    expect(resolveBootTenant(env(), 'runtime', 'scs')).toBe('scs'));

  it('runtime mode falls back without a stored tenant', () =>
    expect(resolveBootTenant(env(), 'runtime', null)).toBe('kring'));

  it('runtime mode falls back on an invalid stored tenant', () =>
    expect(resolveBootTenant(env(), 'runtime', '../x')).toBe('kring'));
});

describe('isValidTenantId', () => {
  it.each(['', 'SCS', '../x', 'scs/..', 'a', 'x'.repeat(40), ' scs', 'sc s', '1scs', undefined, null, 42])(
    'rejects %j', (id) => expect(isValidTenantId(id)).toBe(false));

  it.each(['scs', 'p13', 'la21staefa', 'bka'])('accepts %s', (id) =>
    expect(isValidTenantId(id)).toBe(true));
});

describe('readStoredTenant', () => {
  it('returns null when storage throws', () =>
    expect(readStoredTenant({ getItem: () => { throw new Error('denied'); } })).toBeNull());

  it('returns null without storage', () => expect(readStoredTenant(undefined)).toBeNull());

  it('drops an invalid stored id', () => expect(readStoredTenant(store('../evil'))).toBeNull());

  it('reads the portal key', () => {
    let asked = '';
    readStoredTenant({ getItem: (k: string) => { asked = k; return 'scs'; } });
    expect(asked).toBe(PORTAL_TENANT_KEY);
  });

  it('returns a valid stored id', () => expect(readStoredTenant(store('p13'))).toBe('p13'));
});

describe('bootEnvironment', () => {
  it('fixed mode returns the same object', () => {
    const e = env();
    expect(bootEnvironment(e)).toBe(e);
  });

  it('runtime mode sets tenantId and appId from storage', () => {
    localStorage.setItem(PORTAL_TENANT_KEY, 'scs');
    const e = env();
    const result = bootEnvironment(e, 'runtime');
    expect(result.tenantId).toBe('scs');
    expect(result.appId).toBe('scs');
    expect(e.tenantId).toBe('kring');
    localStorage.removeItem(PORTAL_TENANT_KEY);
  });

  it('runtime mode boots the build tenant when reading localStorage itself throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('blocked', 'SecurityError'); } });
    try {
      expect(bootEnvironment(env(), 'runtime').tenantId).toBe('kring');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });

  it('runtime mode keeps the build id', () => {
    localStorage.setItem(PORTAL_TENANT_KEY, 'scs');
    const result = bootEnvironment(env(), 'runtime');
    expect(result.appId).toBe('scs');
    expect(result.buildId).toBe('kring');
    localStorage.removeItem(PORTAL_TENANT_KEY);
  });

  it('runtime mode returns the same object on every call', () => {
    const e = env();
    expect(bootEnvironment(e, 'runtime')).toBe(bootEnvironment(e, 'runtime'));
  });
});

describe('provideBootEnv', () => {
  it('provides ENV with the boot environment', () => {
    const e = env();
    expect(provideBootEnv(e)).toEqual({ provide: ENV, useValue: e });
  });
});

describe('consumeTenantQueryParam', () => {
  const mem = (v: string | null) => {
    const data: Record<string, string> = v ? { [PORTAL_TENANT_KEY]: v } : {};
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, x: string) => { data[k] = x; } };
  };

  it('consumeTenantQueryParam reports a change only for a different valid tenant', () => {
    const s = mem('scs');
    const r = consumeTenantQueryParam({ href: 'https://x.test/home?tenant=p13&a=1#f' }, s);
    expect(r).toEqual({ changed: true, cleanUrl: 'https://x.test/home?a=1#f' });
    expect(s.data[PORTAL_TENANT_KEY]).toBe('p13');
  });

  it('the same tenant is no change', () => {
    const s = mem('scs');
    expect(consumeTenantQueryParam({ href: 'https://x.test/?tenant=scs' }, s))
      .toEqual({ changed: false, cleanUrl: 'https://x.test/' });
  });

  it('an invalid tenant stores nothing and still cleans the url', () => {
    const s = mem('scs');
    expect(consumeTenantQueryParam({ href: 'https://x.test/?tenant=..%2Fx' }, s))
      .toEqual({ changed: false, cleanUrl: 'https://x.test/' });
    expect(s.data[PORTAL_TENANT_KEY]).toBe('scs');
  });

  it('without the parameter nothing happens', () => {
    const s = mem(null);
    expect(consumeTenantQueryParam({ href: 'https://x.test/a?b=1' }, s)).toEqual({ changed: false, cleanUrl: null });
    expect(s.data).toEqual({});
  });

  it('a first choice without a stored tenant is a change', () => {
    const s = mem(null);
    expect(consumeTenantQueryParam({ href: 'https://x.test/?tenant=p13' }, s).changed).toBe(true);
  });
});
