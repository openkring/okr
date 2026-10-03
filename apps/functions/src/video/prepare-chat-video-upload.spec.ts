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
import { chatFolderKeys, MAX_VIDEO_BYTES } from './chat-video.util';
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

const year = String(new Date().getFullYear());
const keys = chatFolderKeys('scs', ROOM, year);

beforeEach(() => {
  state.collections = {};
  state.creates = [];
  state.adds = [];
  state.signCalls = [];
  state.joined = new Set(['@p1:hs']);
  state.roomCheck = undefined;
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
    expect(folders[keys.year]).toMatchObject({ name: year, parents: [keys.root], matrixRoomId: '' });
    expect(folders[keys.videos]).toMatchObject({ name: 'videos', parents: [keys.year], matrixRoomId: '' });
    expect(Object.values(folders).every(f => !('okey' in f))).toBe(true);

    expect(state.adds).toHaveLength(1);
    const doc = state.adds[0];
    expect(doc.collection).toBe(DocumentCollection);
    expect(doc.data).not.toHaveProperty('okey');
    expect(doc.data).toMatchObject({
      title: 'clip.mov', mimeType: 'video/quicktime', size: 1234, folderKeys: [keys.videos],
      authorKey: 'P1', tenants: ['scs'], tags: '@tag.scs,@tag.chat', version: '1.0',
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
      [keys.root]: { name: 'Renamed by a member', matrixRoomId: ROOM, parents: [] },
      [keys.year]: { name: year, matrixRoomId: '', parents: [keys.root] },
      [keys.videos]: { name: 'videos', matrixRoomId: '', parents: [keys.year] },
    };
    await call();
    expect(state.collections[FolderCollection][keys.root]['name']).toBe('Renamed by a member');
    expect(state.adds).toHaveLength(1);
  });

  it('refuses to write into a root folder that names another room', async () => {
    state.collections[FolderCollection] = { [keys.root]: { name: 'x', matrixRoomId: '!other:hs', parents: [] } };
    expect(await code(call())).toBe('failed-precondition');
    expect(state.adds).toEqual([]);
    expect(state.signCalls).toEqual([]);
  });
});
