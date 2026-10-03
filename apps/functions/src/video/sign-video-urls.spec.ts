import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 1.82 §8 — the room-audience gate of `signVideoUrls`, exercised through the callable's
// `run()` with an in-memory Firestore, a stubbed private bucket and a mocked Synapse `/members`.
type Data = Record<string, unknown> | undefined;
const state = vi.hoisted(() => ({
  collections: {} as Record<string, Record<string, Record<string, unknown>>>,
  getAllCalls: [] as string[][],
}));

vi.mock('firebase-admin/firestore', () => {
  const ref = (collection: string, id: string) => ({
    collection, id,
    get: async () => {
      const data: Data = state.collections[collection]?.[id];
      return { id, exists: data !== undefined, data: () => data };
    },
  });
  return {
    getFirestore: () => ({
      collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
      getAll: async (...refs: { collection: string; id: string }[]) => {
        state.getAllCalls.push(refs.map(r => `${r.collection}/${r.id}`));
        return refs.map(r => {
          const data: Data = state.collections[r.collection]?.[r.id];
          return { id: r.id, exists: data !== undefined, data: () => data };
        });
      },
    }),
  };
});
vi.mock('firebase-functions/params', () => ({ defineSecret: (name: string) => ({ value: () => `secret-${name}` }) }));
vi.mock('@okr/shared-util-functions', () => ({
  checkAppCheckToken: () => undefined,
  checkAuthentication: () => undefined,
  getCallerTenantId: async () => 'scs',
}));
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({
    file: () => ({ exists: async () => [true], getSignedUrl: async () => ['https://signed.example/dl'] }),
  }),
}));

import { DocumentCollection, FolderCollection } from '@okr/shared-models';
import { signVideoUrls } from './sign-video-urls';

const CALLER = '@p1:bkchat.etke.host';
const video = (key: string, folderKey: string) => ({
  tenants: ['scs'], isArchived: false, mimeType: 'video/mp4',
  fullPath: `tenant/scs/folder/${folderKey}/album/ab/${key}.mp4`, folderKeys: [folderKey],
});
const folder = (parents: string[] = [], matrixRoomId?: string) =>
  ({ tenants: ['scs'], isArchived: false, parents, ...(matrixRoomId === undefined ? {} : { matrixRoomId }) });

let members: Record<string, string[] | 'error'>;
const fetchMock = vi.fn(async (url: string) => {
  const roomId = decodeURIComponent(/rooms\/([^/]+)\/members/.exec(url)?.[1] ?? '');
  const m = members[roomId];
  if (m === undefined || m === 'error') return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ members: m, total: m.length }) };
});

async function call(docKeys: string[]): Promise<string[]> {
  const res = await signVideoUrls.run({ data: { docKeys }, auth: { uid: 'u1' } } as never);
  return res.videos.map(v => v.key).sort();
}

beforeEach(() => {
  state.getAllCalls = [];
  members = {};
  state.collections = {
    users: { u1: { personKey: 'P1' } },
    [DocumentCollection]: {
      plain: video('plain', 'pf'),
      inroom: video('inroom', 'month'),
      other: video('other', 'otherRoot'),
    },
    [FolderCollection]: {
      pf: folder(),                                  // legacy: no matrixRoomId field at all
      root: folder([], '!room:hs'),
      year: folder(['root']),
      month: folder(['year']),
      otherRoot: folder([], '!other:hs'),
    },
  };
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('signVideoUrls room audience', () => {
  it('signs a plain album video without asking Synapse', async () => {
    expect(await call(['plain'])).toEqual(['plain']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs a room album video for a joined member (room found on an ancestor two levels up)', async () => {
    members = { '!room:hs': [CALLER, '@p2:bkchat.etke.host'] };
    expect(await call(['inroom', 'plain'])).toEqual(['inroom', 'plain']);
    // the ancestors were fetched iteratively: month → year → root
    expect(state.getAllCalls.flat()).toEqual(expect.arrayContaining([`${FolderCollection}/year`, `${FolderCollection}/root`]));
  });

  it('omits a room album video for a caller who left the room (Synapse is the truth)', async () => {
    members = { '!room:hs': ['@p2:bkchat.etke.host'] };
    expect(await call(['inroom', 'plain'])).toEqual(['plain']);
  });

  it('fails closed when the Synapse lookup errors', async () => {
    members = { '!room:hs': 'error' };
    expect(await call(['inroom', 'plain'])).toEqual(['plain']);
  });

  it('checks each distinct room once and per room', async () => {
    members = { '!room:hs': [CALLER], '!other:hs': ['@p2:bkchat.etke.host'] };
    expect(await call(['inroom', 'other', 'plain'])).toEqual(['inroom', 'plain']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits room videos but keeps plain ones for a caller without a linked person', async () => {
    members = { '!room:hs': [CALLER] };
    state.collections['users'] = { u1: {} };
    expect(await call(['inroom', 'plain'])).toEqual(['plain']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends the admin token anywhere but the Authorization header', async () => {
    members = { '!room:hs': [CALLER] };
    await call(['inroom']);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).not.toContain('secret-');
    expect(init.headers['Authorization']).toBe('Bearer secret-MATRIX_ADMIN_TOKEN');
  });
});
