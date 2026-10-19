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
import { isGenuineNotesRoom } from './notes-room';

const json = (body: unknown, status = 200) => ({
  ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body),
});
const req = (data: unknown) => ({ auth: { uid: 'u1' }, app: {}, data }) as never;

const BOT = '@bk2-bot:hs';

/**
 * Synapse with a group room, a genuine notes room (bot-created, bot + owner, marker [scs], exact
 * own alias) and a fake one: a member created a room and gave it a #notes_ alias to hide it from
 * moderation. All marked for scs.
 */
const ROOMS: Record<string, { alias: string; creator: string; members: string[] }> = {
  '!group:hs': { alias: '#group_g1:hs', creator: BOT, members: [BOT, '@a:hs', '@b:hs'] },
  '!notes:hs': { alias: '#notes_scs_kaiser:hs', creator: BOT, members: [BOT, '@kaiser:hs'] },
  '!fake:hs': { alias: '#notes_scs_mallory:hs', creator: '@mallory:hs', members: ['@mallory:hs', '@victim:hs'] },
};

describe('isGenuineNotesRoom', () => {
  const genuine = { canonicalAlias: '#notes_scs_kaiser:hs', creator: BOT, joinedMembers: new Set([BOT, '@kaiser:hs']), marker: ['scs'] };
  it('accepts a bot-created room whose alias is exactly its single member\'s notes alias', () => {
    expect(isGenuineNotesRoom(genuine, BOT)).toBe(true);
  });
  it('rejects a room a member created', () => {
    expect(isGenuineNotesRoom({ ...genuine, creator: '@kaiser:hs' }, BOT)).toBe(false);
  });
  it('rejects a #notes_ alias that is not the member\'s own', () => {
    expect(isGenuineNotesRoom({ ...genuine, canonicalAlias: '#notes_scs_someone:hs' }, BOT)).toBe(false);
  });
  it('rejects a room with more than the owner and the bot', () => {
    expect(isGenuineNotesRoom({ ...genuine, joinedMembers: new Set([BOT, '@kaiser:hs', '@x:hs']) }, BOT)).toBe(false);
  });
  it('rejects a wrong, missing or multi-tenant marker', () => {
    expect(isGenuineNotesRoom({ ...genuine, marker: ['p13'] }, BOT)).toBe(false);
    expect(isGenuineNotesRoom({ ...genuine, marker: undefined }, BOT)).toBe(false);
    expect(isGenuineNotesRoom({ ...genuine, marker: ['scs', 'p13'] }, BOT)).toBe(false);
  });
  it('rejects a bot from another server and a non-#notes_ alias', () => {
    expect(isGenuineNotesRoom({ ...genuine, creator: '@bk2-bot:evil' }, BOT)).toBe(false);
    expect(isGenuineNotesRoom({ ...genuine, canonicalAlias: '#group_g1:hs' }, BOT)).toBe(false);
  });
});

describe('admin room tools exclude notes rooms', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/_synapse/admin/v1/rooms?')) {
        return json({
          rooms: Object.entries(ROOMS).map(([room_id, r]) => ({
            room_id, name: room_id, canonical_alias: r.alias, creator: r.creator, joined_members: r.members.length, public: false,
          })),
          total_rooms: 3,
        });
      }
      if (url.includes('/state/org.okr.tenant/')) return json({ tenants: ['scs'] });
      if (url.includes('/_synapse/admin/v2/rooms/') && init?.method === 'DELETE') return json({ delete_id: 'd1' });
      if (url.includes('/messages?')) return json({ chunk: [], end: undefined });
      if (url.endsWith('/state')) return json({ state: [] });
      if (url.endsWith('/account/whoami')) return json({ user_id: BOT });
      const members = /\/_synapse\/admin\/v1\/rooms\/([^/?]+)\/members$/.exec(url);
      if (members) return json({ members: ROOMS[decodeURIComponent(members[1])]?.members ?? [] });
      const details = /\/_synapse\/admin\/v1\/rooms\/([^/?]+)$/.exec(url);
      if (details) {
        const roomId = decodeURIComponent(details[1]);
        return json({ room_id: roomId, name: roomId, canonical_alias: ROOMS[roomId]?.alias, creator: ROOMS[roomId]?.creator });
      }
      return json({});
    });
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('listMatrixRooms filters out the genuine notes room only', async () => {
    const result = await listMatrixRooms.run(req({}));
    expect(result.rooms.map((r) => r.roomId)).toEqual(['!group:hs', '!fake:hs']);
  });

  it('a member-created room with a #notes_ alias stays readable and deletable', async () => {
    await expect(getRoomMessages.run(req({ roomId: '!fake:hs' }))).resolves.toMatchObject({ messages: [] });
    await expect(deleteMatrixRoom.run(req({ roomId: '!fake:hs' }))).resolves.toEqual({ deleteId: 'd1' });
  });

  it('a #notes_ room whose members cannot be read is refused (fails closed), not exposed', async () => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.endsWith('/members') ? json({}, 503) : base(url, init));
    await expect(getRoomMessages.run(req({ roomId: '!notes:hs' }))).rejects.toMatchObject({ code: 'unavailable' });
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
