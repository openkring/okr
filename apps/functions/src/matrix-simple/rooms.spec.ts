import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every caller is an admin of tenant scs (users/{uid}: roles + tenants).
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ roles: { admin: true }, tenants: ['scs'] }) }),
      }),
    }),
  }),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { deleteMatrixRoom, getRoomMessages, listMatrixRooms } from './rooms';
import { isNotesRoomAlias } from './shared';

const json = (body: unknown, status = 200) => ({
  ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body),
});
const req = (data: unknown) => ({ auth: { uid: 'u1' }, app: {}, data }) as never;

/** Synapse with one group room and one notes room, both marked for scs. */
const ROOMS: Record<string, string> = {
  '!group:hs': '#group_g1:hs',
  '!notes:hs': '#notes_scs_kaiser:hs',
};

describe('isNotesRoomAlias (server)', () => {
  it('matches only #notes_ aliases', () => {
    expect(isNotesRoomAlias('#notes_scs_kaiser:hs')).toBe(true);
    expect(isNotesRoomAlias('#group_g1:hs')).toBe(false);
    expect(isNotesRoomAlias(undefined)).toBe(false);
    expect(isNotesRoomAlias(null)).toBe(false);
  });
});

describe('admin room tools exclude notes rooms', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/_synapse/admin/v1/rooms?')) {
        return json({
          rooms: Object.entries(ROOMS).map(([room_id, canonical_alias]) => ({
            room_id, name: room_id, canonical_alias, joined_members: 2, public: false,
          })),
          total_rooms: 2,
        });
      }
      if (url.includes('/state/org.okr.tenant/')) return json({ tenants: ['scs'] });
      if (url.includes('/_synapse/admin/v2/rooms/') && init?.method === 'DELETE') return json({ delete_id: 'd1' });
      if (url.includes('/messages?')) return json({ chunk: [], end: undefined });
      if (url.endsWith('/state')) return json({ state: [] });
      const details = /\/_synapse\/admin\/v1\/rooms\/([^/?]+)$/.exec(url);
      if (details) {
        const roomId = decodeURIComponent(details[1]);
        return json({ room_id: roomId, name: roomId, canonical_alias: ROOMS[roomId] });
      }
      return json({});
    });
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('listMatrixRooms filters out notes rooms', async () => {
    const result = await listMatrixRooms.run(req({}));
    expect(result.rooms.map((r) => r.roomId)).toEqual(['!group:hs']);
  });

  it('getRoomMessages rejects a notes room with permission-denied', async () => {
    await expect(getRoomMessages.run(req({ roomId: '!notes:hs' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/messages?'))).toBe(false);
  });

  it('getRoomMessages still reads a group room', async () => {
    await expect(getRoomMessages.run(req({ roomId: '!group:hs' }))).resolves.toMatchObject({ messages: [] });
  });

  it('deleteMatrixRoom rejects a notes room with permission-denied and deletes nothing', async () => {
    await expect(deleteMatrixRoom.run(req({ roomId: '!notes:hs' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
  });

  it('deleteMatrixRoom still deletes a group room', async () => {
    await expect(deleteMatrixRoom.run(req({ roomId: '!group:hs' }))).resolves.toEqual({ deleteId: 'd1' });
  });

  it('fails closed when the room details cannot be read', async () => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      /\/_synapse\/admin\/v1\/rooms\/[^/?]+$/.test(url) ? json({}, 503) : base(url, init));
    await expect(deleteMatrixRoom.run(req({ roomId: '!group:hs' }))).rejects.toMatchObject({ code: 'unavailable' });
  });
});
