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

import { handleCreateSrvContact, handleGetSrvMembersAll, handlePreviewSrvUpdate, handleUpdateSrvContact } from './contact';

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
    // PortalTest no longer marks emails (REGASOFT_TEST_EMAIL_MARK off): emails round-trip unchanged …
    expect(res.before).toEqual(RAW);
    expect(res.after).toEqual({ ...RAW, city: 'Uster', email: 'a@b.ch' });
    // … and the payload is exactly what would be sent, every key round-trips, no x appended.
    expect(res.payload).toEqual({ ...RAW, city: 'Uster', email: 'a@b.ch' });
    expect(axiosPut).not.toHaveBeenCalled();
    expect(invalidateProvider).not.toHaveBeenCalled();
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

describe('handlePreviewSrvUpdate: modified (C5)', () => {
  const LIST = 'https://regasoft.swissrowing.ch/PortalTest/api/club/members';
  const answer = (byUrl: Record<string, unknown>) => async (url: string) => ({ data: byUrl[url] ?? { data: RAW } });

  it('takes modified from the current member list', async () => {
    gatewayFetch.mockImplementation(answer({ [LIST]: { data: [{ id: 1, modified: 'x' }, { id: 26183, modified: '2026-10-30T14:12:05' }] } }));
    const res = await handlePreviewSrvUpdate(req({ srvId: 26183, changes: { city: 'Uster' } }));
    expect(res.modified).toBe('2026-10-30T14:12:05');
    // it only informs: no retry, short timeout
    expect(gatewayFetch).toHaveBeenCalledWith(LIST, expect.objectContaining({ maxRetries: 0, timeoutMs: 5000 }));
    expect(gatewayFetch).not.toHaveBeenCalledWith(`${LIST}?inactive=true`, expect.anything());
  });

  it('falls back to the list of members who left', async () => {
    gatewayFetch.mockImplementation(answer({
      [LIST]: { data: [{ id: 1, modified: 'x' }] },
      [`${LIST}?inactive=true`]: { data: [{ id: 26183, modified: '2025-12-31T08:00:00' }] },
    }));
    expect((await handlePreviewSrvUpdate(req({ srvId: 26183, changes: { city: 'Uster' } }))).modified).toBe('2025-12-31T08:00:00');
  });

  it('null when neither list has the member, or the list read fails — the preview still comes back', async () => {
    gatewayFetch.mockImplementation(answer({ [LIST]: { data: [] }, [`${LIST}?inactive=true`]: { data: [] } }));
    expect((await handlePreviewSrvUpdate(req({ srvId: 26183, changes: { city: 'Uster' } }))).modified).toBeNull();

    gatewayFetch.mockImplementation(async (url: string) => {
      if (url.startsWith(`${LIST}/`)) return { data: { data: RAW } };
      throw new Error('timeout');
    });
    const res = await handlePreviewSrvUpdate(req({ srvId: 26183, changes: { city: 'Uster' } }));
    expect(res.modified).toBeNull();
    expect(res.payload).toMatchObject({ city: 'Uster' });
  });
});

describe('handleGetSrvMembersAll (C1, C3)', () => {
  const rec = (id: number, extra: Record<string, unknown> = {}) => ({
    ...RAW, id, serviceId: id + 1000, personClubs: [{ personId: 0, clubId: 26, clubName: 'Seeclub', mainClub: true }], ...extra,
  });
  const gateway = (opts: { active?: unknown[]; inactive?: unknown[]; countries?: unknown; failCountries?: boolean; failInactive?: boolean }) =>
    runGateway.mockImplementation(async (adapter: { id: string }, params: { inactive?: boolean }) => {
      if (adapter.id === 'srv-countries') {
        if (opts.failCountries) throw new Error('down');
        return { data: opts.countries ?? [{ id: 3, countryCode: 'CH', ioc: 'SUI' }], cached: false };
      }
      if (adapter.id === 'srv-members-all') {
        if (params.inactive && opts.failInactive) throw new Error('down');
        return { data: params.inactive ? opts.inactive ?? [] : opts.active ?? [], cached: false };
      }
      throw new Error(`unexpected adapter ${adapter.id}`);
    });

  beforeEach(() => { process.env['REGASOFT_CLUBID'] = '26'; });

  it('requires memberAdmin and returns current and left members with the country list', async () => {
    gateway({ active: [rec(1), rec(2)], inactive: [rec(3, { leavingDate: '2025-12-31T00:00:00' })] });
    const res = await handleGetSrvMembersAll(req({}));

    expect(checkRoles).toHaveBeenCalledWith(expect.anything(), 'getSrvMembersAll', ['memberAdmin']);
    expect(res.members.map(m => [m.contact.srvId, m.active])).toEqual([[1, true], [2, true], [3, false]]);
    expect(res.members[2].detail.leavingDate).toBe('20251231');
    expect(res.members[0].contact.mainClub).toBe(true);
    expect(res.members[0].contact.email).toBe('bruno@example.chx');   // mark off: read unchanged
    expect(res.countries).toEqual([{ id: 3, countryCode: 'CH', ioc: 'SUI' }]);
  });

  it('a member in both lists is kept once, as current', async () => {
    gateway({ active: [rec(1)], inactive: [rec(1, { leavingDate: '2025-12-31T00:00:00' }), rec(4)] });
    const res = await handleGetSrvMembersAll(req({}));
    expect(res.members.map(m => [m.contact.srvId, m.active])).toEqual([[1, true], [4, false]]);
  });

  it('drops records without a numeric id', async () => {
    gateway({ active: [rec(1), { ...rec(2), id: null }] });
    expect((await handleGetSrvMembersAll(req({}))).members.map(m => m.contact.srvId)).toEqual([1]);
  });

  it('a failed country list gives no countries, the members still come', async () => {
    gateway({ active: [rec(1)], failCountries: true });
    const res = await handleGetSrvMembersAll(req({}));
    expect(res.countries).toEqual([]);
    expect(res.members).toHaveLength(1);
  });

  it('a failed list of members who left fails the call', async () => {
    gateway({ active: [rec(1)], failInactive: true });
    await expect(handleGetSrvMembersAll(req({}))).rejects.toThrow('down');
  });

  it('requires authentication', async () => {
    await expect(handleGetSrvMembersAll(req({}, null))).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(runGateway).not.toHaveBeenCalled();
  });
});

describe('handleUpdateSrvContact (switched on after the Task 9 gate)', () => {
  it('reads live, PUTs the complete record with the change, reads back, and drops the caches', async () => {
    let stored: Record<string, unknown> = { ...RAW };
    gatewayFetch.mockImplementation(async () => ({ data: { data: stored, success: true, message: null } }));
    axiosPut.mockImplementation(async (_url: string, body: Record<string, unknown>) => { stored = body; return { data: { data: true } }; });

    const res = await handleUpdateSrvContact(req({ srvId: 26183, changes: { city: 'Uster' } }));

    expect(checkRoles).toHaveBeenCalledWith(expect.anything(), 'updateSrvContact', ['memberAdmin']);
    expect(axiosPut).toHaveBeenCalledTimes(1);
    expect(axiosPut.mock.calls[0][0]).toBe('https://regasoft.swissrowing.ch/PortalTest/api/club/members/26183');
    expect(axiosPut.mock.calls[0][1]).toEqual({ ...RAW, city: 'Uster' });   // every key, incl. futureField and entryDate
    expect(res.written).toEqual(['city']);
    expect(res.ignored).toEqual([]);
    expect(invalidateProvider).toHaveBeenCalled();
  });

  it('sends nothing when the change set changes nothing', async () => {
    const res = await handleUpdateSrvContact(req({ srvId: 26183, changes: { city: 'Stäfa' } }));
    expect(axiosPut).not.toHaveBeenCalled();
    expect(res.written).toEqual([]);
  });

  it('still requires a valid srvId and accepts only writable fields', async () => {
    await expect(handleUpdateSrvContact(req({ changes: { city: 'Uster' } }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(handleUpdateSrvContact(req({ srvId: 26183, changes: { hasNewsletter: false } }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosPut).not.toHaveBeenCalled();
  });
});

describe('create stays switched off', () => {

  it('create is rejected before anything is sent', async () => {
    await expect(handleCreateSrvContact(req({ firstName: 'A', lastName: 'B', dateOfBirth: '19900102', gender: 2, email: null, mobile: null })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
