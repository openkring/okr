import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 1.82 §8 — the room-audience gate of `signVideoUrls`, exercised through the callable's
// `run()` with an in-memory Firestore, a stubbed private bucket and a mocked Synapse `/members`.
type Data = Record<string, unknown> | undefined;
const state = vi.hoisted(() => ({
  collections: {} as Record<string, Record<string, Record<string, unknown>>>,
  getAllCalls: [] as string[][],
  docIds: [] as string[],
}));

vi.mock('firebase-admin/firestore', () => {
  // Like the Admin SDK: `doc()` THROWS for a reserved `__…__` id, a `/`, `.`/`..` or an empty id.
  const ref = (collection: string, id: string) => {
    state.docIds.push(id);
    if (id === '' || id === '.' || id === '..' || id.includes('/') || /^__.*__$/.test(id)) {
      throw new Error(`Invalid document id: ${id}`);
    }
    return refOk(collection, id);
  };
  const refOk = (collection: string, id: string) => ({
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
  state.docIds = [];
  members = {};
  state.collections = {
    users: { u1: { personKey: 'P1' } },
    [DocumentCollection]: {
      plain: video('plain', 'pf'),
      inroom: video('inroom', 'month'),
      other: video('other', 'otherRoot'),
      // A doc in a PLAIN folder whose author pointed fullPath into the room album (the hole).
      spoof: { ...video('spoof', 'pf'), fullPath: 'tenant/scs/folder/month/album/ab/inroom.mp4' },
      // Same, with no folderKeys at all.
      orphanSpoof: { ...video('orphanSpoof', 'pf'), folderKeys: [], fullPath: 'tenant/scs/folder/month/album/ab/inroom.mp4' },
      // fullPath into a folder that does not exist.
      ghostPath: { ...video('ghostPath', 'pf'), fullPath: 'tenant/scs/folder/ghost/album/ab/x.mp4' },
      // A section album with no folders stays allowed as before.
      sectionVid: { ...video('sectionVid', 'pf'), folderKeys: [], fullPath: 'tenant/scs/section/s1/album/ab/x.mp4' },
      // Folder chain with a missing ancestor.
      brokenChain: video('brokenChain', 'orphanChild'),
      // Lives in a room-B album, file path in room A's album: needs both rooms.
      twoRooms: { ...video('twoRooms', 'otherRoot'), fullPath: 'tenant/scs/folder/month/album/ab/two.mp4' },
      // Unsafe document ids in author-editable fields: must be denied, never thrown.
      slashFolder: { ...video('slashFolder', 'pf'), folderKeys: ['a/b'] },
      reservedFolder: { ...video('reservedFolder', 'pf'), folderKeys: ['pf', '__a__'] },
      longFolder: { ...video('longFolder', 'pf'), folderKeys: ['x'.repeat(129)] },
      reservedPath: { ...video('reservedPath', 'pf'), fullPath: 'tenant/scs/folder/__a__/album/ab/x.mp4' },
      dotPath: { ...video('dotPath', 'pf'), fullPath: 'tenant/scs/folder/../album/ab/x.mp4' },
      badAncestor: video('badAncestor', 'badParentChild'),
    },
    [FolderCollection]: {
      pf: folder(),                                  // legacy: no matrixRoomId field at all
      root: folder([], '!room:hs'),
      year: folder(['root']),
      month: folder(['year']),
      otherRoot: folder([], '!other:hs'),
      orphanChild: folder(['vanished']),
      badParentChild: folder(['__x__']),
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

  it('(a) gates a plain-folder doc whose fullPath points into a room album by the path folder', async () => {
    members = { '!room:hs': ['@p2:bkchat.etke.host'] };
    expect(await call(['spoof', 'plain'])).toEqual(['plain']);
    members = { '!room:hs': [CALLER] };
    expect(await call(['spoof', 'plain'])).toEqual(['plain', 'spoof']);
  });

  it('(b) gates a doc without folderKeys whose fullPath points into a room album', async () => {
    members = { '!room:hs': ['@p2:bkchat.etke.host'] };
    expect(await call(['orphanSpoof'])).toEqual([]);
    members = { '!room:hs': [CALLER] };
    expect(await call(['orphanSpoof'])).toEqual(['orphanSpoof']);
  });

  it('(c) denies a folder path whose folder does not exist', async () => {
    expect(await call(['ghostPath', 'plain'])).toEqual(['plain']);
  });

  it('keeps a section album doc without folders signable', async () => {
    expect(await call(['sectionVid'])).toEqual(['sectionVid']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('(d) denies a doc whose folder chain has a missing ancestor', async () => {
    expect(await call(['brokenChain', 'plain'])).toEqual(['plain']);
  });

  it('(e) requires membership in every room the doc touches', async () => {
    members = { '!room:hs': [CALLER], '!other:hs': ['@p2:bkchat.etke.host'] };
    expect(await call(['twoRooms'])).toEqual([]);
    members = { '!room:hs': ['@p2:bkchat.etke.host'], '!other:hs': [CALLER] };
    expect(await call(['twoRooms'])).toEqual([]);
    members = { '!room:hs': [CALLER], '!other:hs': [CALLER] };
    expect(await call(['twoRooms'])).toEqual(['twoRooms']);
  });

  it('never sends the admin token anywhere but the Authorization header', async () => {
    members = { '!room:hs': [CALLER] };
    await call(['inroom']);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).not.toContain('secret-');
    expect(init.headers['Authorization']).toBe('Bearer secret-MATRIX_ADMIN_TOKEN');
  });

  it('filters unsafe requested keys without throwing and signs the good ones', async () => {
    const bad = ['__a__', 'a/b', '..', '.', 'k'.repeat(129)];
    expect(await call([...bad, 'plain'])).toEqual(['plain']);
    for (const b of bad) expect(state.docIds).not.toContain(b);
  });

  it('denies docs whose start or ancestor keys are unsafe, without throwing, and keeps the batch', async () => {
    const keys = ['slashFolder', 'reservedFolder', 'longFolder', 'reservedPath', 'dotPath', 'badAncestor', 'plain'];
    expect(await call(keys)).toEqual(['plain']);
    // None of the unsafe ids ever reached `db.doc()` (it would have thrown).
    for (const b of ['a/b', '__a__', 'x'.repeat(129), '..', '__x__']) expect(state.docIds).not.toContain(b);
  });
});
