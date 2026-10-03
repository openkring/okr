import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

// Spec 1.82 §8 — `prepareChatVideoUpload`: the joined check comes before any write, folders are
// created only if absent, and the signed upload URL binds contentType and the size range.
const state = vi.hoisted(() => ({
  collections: {} as Record<string, Record<string, Record<string, unknown>>>,
  creates: [] as string[],
  adds: [] as { collection: string; data: Record<string, unknown> }[],
  signCalls: [] as { path: string; opts: Record<string, unknown> }[],
  joined: new Set<string>(),
  roomCheck: undefined as Error | undefined,
  summary: undefined as { name: string; canonicalAlias: string } | undefined,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (collection: string) => ({
      doc: (id: string) => ({
        id,
        get: async () => {
          const data = state.collections[collection]?.[id];
          return { id, exists: data !== undefined, data: () => data };
        },
        create: async (data: Record<string, unknown>) => {
          state.creates.push(`${collection}/${id}`);
          if (state.collections[collection]?.[id] !== undefined) throw Object.assign(new Error('exists'), { code: 6 });
          (state.collections[collection] ??= {})[id] = data;
        },
      }),
      add: async (data: Record<string, unknown>) => {
        state.adds.push({ collection, data });
        return { id: 'newDoc' };
      },
    }),
  }),
}));
vi.mock('@okr/shared-util-functions', () => ({
  checkAppCheckToken: () => undefined,
  checkAuthentication: () => undefined,
  getCallerTenantId: async () => 'scs',
}));
vi.mock('../matrix-simple/shared', () => ({
  matrixAdminToken: { value: () => 'admin-token' },
  requireUserPersonKey: async () => 'P1',
  serverHostname: () => 'hs',
  requireRoomInTenant: async () => {
    if (state.roomCheck) throw state.roomCheck;
    return ['scs'];
  },
  getJoinedMemberIds: async () => state.joined,
  getRoomSummary: async () => state.summary,
}));
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({
    file: (path: string) => ({
      getSignedUrl: async (opts: Record<string, unknown>) => {
        state.signCalls.push({ path, opts });
        return ['https://signed.example/put'];
      },
    }),
  }),
}));

import { DocumentCollection, FolderCollection } from '@okr/shared-models';
import { chatFolderKeys, MAX_VIDEO_BYTES, zurichStoreDate } from './chat-video.util';
import { prepareChatVideoUpload } from './prepare-chat-video-upload';

const ROOM = '!room:hs';
const request = { roomId: ROOM, roomName: 'Vorstand', fileName: 'clip.mov', size: 1234, mimeType: 'video/quicktime' };
const call = (data: unknown = request) => prepareChatVideoUpload.run({ data, auth: { uid: 'u1' } } as never);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpsError);
    return (e as HttpsError).code;
  }
  return 'resolved';
}

const year = zurichStoreDate(new Date()).slice(0, 4);
const keys = chatFolderKeys('scs', ROOM, year);

beforeEach(() => {
  state.collections = {};
  state.creates = [];
  state.adds = [];
  state.signCalls = [];
  state.joined = new Set(['@p1:hs']);
  state.roomCheck = undefined;
  state.summary = { name: 'Vorstand', canonicalAlias: '#group_vorstand:hs' };
});

describe('prepareChatVideoUpload', () => {
  it('refuses a caller who is not joined, without writing anything', async () => {
    state.joined = new Set(['@other:hs']);
    expect(await code(call())).toBe('permission-denied');
    expect(state.creates).toEqual([]);
    expect(state.adds).toEqual([]);
    expect(state.signCalls).toEqual([]);
  });

  it('passes the room-tenant refusal through, without writing anything', async () => {
    state.roomCheck = new HttpsError('not-found', 'Room not found.');
    expect(await code(call())).toBe('not-found');
    expect(state.creates).toEqual([]);
    expect(state.adds).toEqual([]);
  });

  it('rejects an invalid request', async () => {
    expect(await code(call({ ...request, fileName: 'x.mkv' }))).toBe('invalid-argument');
    expect(state.creates).toEqual([]);
  });

  it('creates the three folders, one document and a signed write URL', async () => {
    const res = await call();
    expect(state.creates).toEqual([
      `${FolderCollection}/${keys.root}`, `${FolderCollection}/${keys.year}`, `${FolderCollection}/${keys.videos}`,
    ]);
    const folders = state.collections[FolderCollection];
    expect(folders[keys.root]).toMatchObject({ name: 'Chat · Vorstand', parents: [], matrixRoomId: ROOM, tenants: ['scs'] });
    // All three name the room: the Storage rule reads only the upload path's own (videos) folder.
    expect(folders[keys.year]).toMatchObject({ name: year, parents: [keys.root], matrixRoomId: ROOM });
    expect(folders[keys.videos]).toMatchObject({ name: 'videos', parents: [keys.year], matrixRoomId: ROOM });
    expect(Object.values(folders).every(f => !('okey' in f))).toBe(true);

    expect(state.adds).toHaveLength(1);
    const doc = state.adds[0];
    expect(doc.collection).toBe(DocumentCollection);
    expect(doc.data).not.toHaveProperty('okey');
    expect(doc.data).toMatchObject({
      title: 'clip.mov', mimeType: 'video/quicktime', size: 1234, folderKeys: [keys.videos],
      authorKey: 'P1', tenants: ['scs'], tags: '@tag.scs,@tag.album', version: '1.0',
    });
    const fullPath = String(doc.data['fullPath']);
    expect(fullPath).toMatch(new RegExp(`^tenant/scs/folder/${keys.videos}/album/[^/]+/clip\\.mov$`));

    expect(state.signCalls).toHaveLength(1);
    expect(state.signCalls[0].path).toBe(fullPath);
    expect(state.signCalls[0].opts).toMatchObject({
      version: 'v4', action: 'write', contentType: 'video/quicktime',
      extensionHeaders: { 'x-goog-content-length-range': `0,${MAX_VIDEO_BYTES}` },
    });
    expect(res).toEqual({ docKey: 'newDoc', uploadUrl: 'https://signed.example/put', contentType: 'video/quicktime', maxBytes: MAX_VIDEO_BYTES });
  });

  it('tolerates existing folders and never overwrites them', async () => {
    state.collections[FolderCollection] = {
      [keys.root]: { name: 'Renamed by a member', matrixRoomId: ROOM, parents: [], tenants: ['scs'] },
      [keys.year]: { name: year, matrixRoomId: ROOM, parents: [keys.root], tenants: ['scs'] },
      [keys.videos]: { name: 'videos', matrixRoomId: ROOM, parents: [keys.year], tenants: ['scs'] },
    };
    await call();
    expect(state.collections[FolderCollection][keys.root]['name']).toBe('Renamed by a member');
    expect(state.adds).toHaveLength(1);
  });

  const chain = () => ({
    [keys.root]: { name: 'r', matrixRoomId: ROOM, parents: [], tenants: ['scs'], isArchived: false },
    [keys.year]: { name: year, matrixRoomId: ROOM, parents: [keys.root], tenants: ['scs'], isArchived: false },
    [keys.videos]: { name: 'videos', matrixRoomId: ROOM, parents: [keys.year], tenants: ['scs'], isArchived: false },
  } as Record<string, Record<string, unknown>>);
  it.each([
    ['wrong parents on videos', (c: Record<string, Record<string, unknown>>) => { c[keys.videos]['parents'] = ['moved']; }],
    ['wrong parents on year', (c: Record<string, Record<string, unknown>>) => { c[keys.year]['parents'] = ['moved']; }],
    ['an archived videos folder', (c: Record<string, Record<string, unknown>>) => { c[keys.videos]['isArchived'] = true; }],
    ['an archived root', (c: Record<string, Record<string, unknown>>) => { c[keys.root]['isArchived'] = true; }],
    ['a videos folder without the room (pre-fix layout)', (c: Record<string, Record<string, unknown>>) => { c[keys.videos]['matrixRoomId'] = ''; }],
    ['a year folder of another room', (c: Record<string, Record<string, unknown>>) => { c[keys.year]['matrixRoomId'] = '!other:hs'; }],
  ])('refuses %s without a doc add or signing', async (_label, mutate) => {
    const c = chain();
    mutate(c);
    state.collections[FolderCollection] = c;
    expect(await code(call())).toBe('failed-precondition');
    expect(state.adds).toEqual([]);
    expect(state.signCalls).toEqual([]);
  });

  it('strips bidi overrides from the document title', async () => {
    await call({ ...request, fileName: 'evil\u202Evom.mov' });
    expect(state.adds[0].data['title']).toBe('evilvom.mov');
  });

  it('signs before it adds the document', async () => {
    const order: string[] = [];
    const sign0 = state.signCalls.push.bind(state.signCalls);
    state.signCalls.push = (...a) => { order.push('sign'); return sign0(...a); };
    const add0 = state.adds.push.bind(state.adds);
    state.adds.push = (...a) => { order.push('add'); return add0(...a); };
    await call();
    expect(order).toEqual(['sign', 'add']);
  });

  it('refuses to write into a root folder that names another room', async () => {
    state.collections[FolderCollection] = { [keys.root]: { name: 'x', matrixRoomId: '!other:hs', parents: [] } };
    expect(await code(call())).toBe('failed-precondition');
    expect(state.adds).toEqual([]);
    expect(state.signCalls).toEqual([]);
  });

  describe('root folder name is derived on the server (privacy, spec 1.82 §8)', () => {
    const rootName = async (data: unknown = request) => {
      await call(data);
      return state.collections[FolderCollection][keys.root]['name'];
    };
    it('names a DM "Chat · Direktnachricht" and ignores the client roomName (the partner)', async () => {
      state.summary = { name: '', canonicalAlias: '' };
      state.joined = new Set(['@p1:hs', '@anna:hs']);
      expect(await rootName({ ...request, roomName: 'Anna Muster' })).toBe('Chat · Direktnachricht');
    });
    it('names a two-member room with a name but no group alias a DM, too', async () => {
      state.summary = { name: 'Anna Muster', canonicalAlias: '' };
      expect(await rootName()).toBe('Chat · Direktnachricht');
    });
    it('falls back to Direktnachricht when the room summary cannot be read', async () => {
      state.summary = undefined;
      expect(await rootName()).toBe('Chat · Direktnachricht');
    });
    it('uses the Synapse room name of a group room, not the client value', async () => {
      state.summary = { name: 'Regatta-Team', canonicalAlias: '#group_regatta:hs' };
      expect(await rootName({ ...request, roomName: 'Spoofed' })).toBe('Chat · Regatta-Team');
    });
    it('treats a room with more than two joined members as a group room', async () => {
      state.summary = { name: 'Grillabend', canonicalAlias: '' };
      state.joined = new Set(['@p1:hs', '@a:hs', '@b:hs']);
      expect(await rootName()).toBe('Chat · Grillabend');
    });
  });
});
