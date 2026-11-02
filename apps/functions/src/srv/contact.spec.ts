import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin', () => ({ firestore: vi.fn() }));

const checkRoles = vi.fn(async () => undefined);
vi.mock('@okr/shared-util-functions', () => ({ checkRoles: (...a: unknown[]) => checkRoles(...(a as [])) }));

const runGateway = vi.fn();
vi.mock('../_gateway/gateway', () => ({
  runGateway: (...a: unknown[]) => runGateway(...a),
  resolveTenantId: async () => 'scs',
}));

const gatewayFetch = vi.fn();
vi.mock('../_gateway/http', () => ({ gatewayFetch: (...a: unknown[]) => gatewayFetch(...a) }));

const invalidateProvider = vi.fn(async () => undefined);
vi.mock('../_gateway/cache', () => ({ invalidateProvider: (...a: unknown[]) => invalidateProvider(...(a as [])) }));

const axiosPut = vi.fn();
const axiosPost = vi.fn();
vi.mock('axios', () => ({
  default: {
    put: (...a: unknown[]) => axiosPut(...a),
    post: (...a: unknown[]) => axiosPost(...a),
    isAxiosError: () => false,
  },
}));

import { handleCreateSrvContact, handlePreviewSrvUpdate, handleUpdateSrvContact } from './contact';

const RAW = {
  id: 26183,
  firstName: 'Bruno',
  lastName: 'Kaiser',
  birthday: '1963-04-12T00:00:00',
  gender: 1,
  city: 'Stäfa',
  email: 'bruno@example.chx',
  entryDate: '2013-03-12T00:00:00',
  futureField: 'kept',
};

const req = (data: unknown, auth: unknown = { uid: 'u1', token: {} }) => ({ auth, data, rawRequest: {} }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['REGASOFT_BASE'];
  gatewayFetch.mockResolvedValue({ data: { data: RAW, success: true, message: null } });
});

describe('handlePreviewSrvUpdate', () => {
  it('reads the record uncached and returns the merged payload without writing', async () => {
    const res = await handlePreviewSrvUpdate(req({ srvId: 26183, changes: { city: 'Uster', email: 'a@b.ch' } }));

    expect(checkRoles).toHaveBeenCalledWith(expect.anything(), 'previewSrvUpdate', ['memberAdmin']);
    expect(runGateway).not.toHaveBeenCalled();
    expect(gatewayFetch).toHaveBeenCalledWith(
      'https://regasoft.swissrowing.ch/PortalTest/api/club/members/26183',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res.before).toEqual(RAW);
    // PortalTest: a changed email gets the x, every other key round-trips.
    expect(res.payload).toEqual({ ...RAW, city: 'Uster', email: 'a@b.chx' });
    expect(axiosPut).not.toHaveBeenCalled();
    expect(invalidateProvider).not.toHaveBeenCalled();
  });

  it('writes no x in production', async () => {
    process.env['REGASOFT_BASE'] = 'https://regasoft.swissrowing.ch/Portal';
    const res = await handlePreviewSrvUpdate(req({ srvId: 26183, changes: { email: 'a@b.ch' } }));
    expect(gatewayFetch.mock.calls[0][0]).toBe('https://regasoft.swissrowing.ch/Portal/api/club/members/26183');
    expect(res.payload['email']).toBe('a@b.ch');
  });

  it('requires authentication', async () => {
    await expect(handlePreviewSrvUpdate(req({ srvId: 1, changes: {} }, null))).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects a missing or invalid srvId', async () => {
    await expect(handlePreviewSrvUpdate(req({ changes: { city: 'Uster' } }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(handlePreviewSrvUpdate(req({ srvId: -3, changes: { city: 'Uster' } }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(gatewayFetch).not.toHaveBeenCalled();
  });

  it('rejects a field Regasoft does not accept', async () => {
    await expect(handlePreviewSrvUpdate(req({ srvId: 26183, changes: { hasNewsletter: false } })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('writes stay switched off', () => {
  it('update is rejected before anything is read or sent', async () => {
    await expect(handleUpdateSrvContact(req({ srvId: 26183, changes: { city: 'Uster' } })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(gatewayFetch).not.toHaveBeenCalled();
    expect(axiosPut).not.toHaveBeenCalled();
  });

  it('create is rejected before anything is sent', async () => {
    await expect(handleCreateSrvContact(req({ firstName: 'A', lastName: 'B', dateOfBirth: '19900102', gender: 2, email: null, mobile: null })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
