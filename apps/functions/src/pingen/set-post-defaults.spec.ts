import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_o: unknown, h: unknown) => h,
  HttpsError: class HttpsError extends Error { constructor(public code: string, m: string) { super(m); } },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('../collection/payment-method', () => ({ callerIsAdmin: vi.fn() }));
vi.mock('@okr/shared-util-functions', () => ({ checkAppCheckToken: vi.fn(), checkAuthentication: vi.fn(), getCallerTenantId: vi.fn() }));

import { setPostDefaultsCore, validatePostOptions, type SetPostDefaultsDeps } from './set-post-defaults';

const OPTIONS = { deliveryProduct: 'fast', printSpectrum: 'color', printMode: 'duplex' };
function deps(over: Partial<SetPostDefaultsDeps> = {}) {
  const writeDefaults = vi.fn(async () => true);
  const d: SetPostDefaultsDeps = { callerIsAdmin: async () => true, callerTenantId: async () => 'scs', writeDefaults, ...over };
  return { d, writeDefaults };
}

describe('setPostDefaultsCore', () => {
  it('writes the options for an admin of that tenant', async () => {
    const { d, writeDefaults } = deps();
    await expect(setPostDefaultsCore(d, { tenantId: 'scs', options: OPTIONS })).resolves.toEqual({ ok: true });
    expect(writeDefaults).toHaveBeenCalledWith('scs', OPTIONS);
  });

  it('refuses a caller who is not an admin', async () => {
    const { d, writeDefaults } = deps({ callerIsAdmin: async () => false });
    await expect(setPostDefaultsCore(d, { tenantId: 'scs', options: OPTIONS })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(writeDefaults).not.toHaveBeenCalled();
  });

  it('refuses an admin of another tenant', async () => {
    const { d, writeDefaults } = deps({ callerTenantId: async () => 'bka' });
    await expect(setPostDefaultsCore(d, { tenantId: 'scs', options: OPTIONS })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(writeDefaults).not.toHaveBeenCalled();
  });

  it('refuses a missing tenant id and invalid options', async () => {
    const { d, writeDefaults } = deps();
    await expect(setPostDefaultsCore(d, { options: OPTIONS })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(setPostDefaultsCore(d, { tenantId: 'scs', options: { ...OPTIONS, printMode: 'triplex' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(writeDefaults).not.toHaveBeenCalled();
  });

  it('answers not-found for a tenant without app-config', async () => {
    const { d } = deps({ writeDefaults: async () => false });
    await expect(setPostDefaultsCore(d, { tenantId: 'scs', options: OPTIONS })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('validatePostOptions', () => {
  it('refuses missing and unknown values instead of defaulting them', () => {
    expect(() => validatePostOptions(undefined)).toThrow();
    expect(() => validatePostOptions({ ...OPTIONS, deliveryProduct: 'x' })).toThrow();
    expect(() => validatePostOptions({ ...OPTIONS, printSpectrum: undefined })).toThrow();
    expect(validatePostOptions({ ...OPTIONS, extra: 1 })).toEqual(OPTIONS);
  });
});
