import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { notesRoomAliasLocalpart } from './shared';
import { assertCallerTenant, assertNotKioskOnly, ensureNotesRoom } from './notes-room';

const HOST = 'bkchat.etke.host';
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body, text: async () => JSON.stringify(body) });

describe('notesRoomAliasLocalpart', () => {
  it('matches the client twin', () => {
    expect(notesRoomAliasLocalpart('scs', 'kaiser')).toBe('notes_scs_kaiser');
  });
  it('lowercases and replaces unsafe characters like the client twin', () => {
    expect(notesRoomAliasLocalpart('SCS', 'Ka:ise/r Ü')).toBe('notes_scs_ka_ise_r__');
  });
});

describe('assertCallerTenant', () => {
  it('returns an owned tenant', () => {
    expect(assertCallerTenant('scs', ['scs', 'p13'])).toBe('scs');
  });
  it('rejects a foreign tenant', () => {
    expect(() => assertCallerTenant('elab', ['scs'])).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });
  it('rejects a missing tenant', () => {
    expect(() => assertCallerTenant(undefined, ['scs'])).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });
});

describe('assertNotKioskOnly', () => {
  it('rejects a kiosk-only user', () => {
    expect(() => assertNotKioskOnly({ kiosk: true, registered: false })).toThrow(
      expect.objectContaining({ code: 'permission-denied' }),
    );
  });
  it('allows a kiosk user with another role', () => {
    expect(() => assertNotKioskOnly({ kiosk: true, registered: true })).not.toThrow();
  });
  it('allows a normal user', () => {
    expect(() => assertNotKioskOnly({ registered: true })).not.toThrow();
    expect(() => assertNotKioskOnly(undefined)).not.toThrow();
  });
});

describe('ensureNotesRoom', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });
  const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init as RequestInit | undefined }));

  /** Mock Synapse for an existing alias whose room has the given creator/marker. */
  const mockExisting = (creator: string, marker: string[] | undefined) =>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/directory/room/') && init?.method === 'DELETE') return json({});
      if (url.includes('/directory/room/')) return json({ room_id: '!old:hs' });
      if (url.includes('/account/whoami')) return json({ user_id: '@bk2-bot:hs' });
      if (url.includes('/_synapse/admin/v1/rooms/')) return json({ creator });
      if (url.includes('/state/org.okr.tenant/')) return marker ? json({ tenants: marker }) : json({}, false);
      if (url.endsWith('/createRoom')) return json({ room_id: '!new:hs' });
      return json({ user_id: '@bk2-bot:hs' });
    });
  const joinedIds = () =>
    calls().filter((c) => c.url.includes('/admin/v1/join/')).map((c) => JSON.parse(c.init!.body as string).user_id);

  it('reuses an own room, without creating one, and re-joins the person', async () => {
    mockExisting('@bk2-bot:hs', ['scs']);
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!old:hs');
    expect(calls().some((c) => c.url.endsWith('/createRoom'))).toBe(false);
    expect(joinedIds()).toContain(`@kaiser:${HOST}`);
  });

  it('deletes a squatted alias and creates a fresh room', async () => {
    mockExisting('@mallory:hs', ['scs']);
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!new:hs');
    expect(calls().some((c) => c.init?.method === 'DELETE' && c.url.includes('/directory/room/'))).toBe(true);
    expect(calls().some((c) => c.url.endsWith('/createRoom'))).toBe(true);
  });

  it('treats a bot-created room with a wrong tenant marker as squatted', async () => {
    mockExisting('@bk2-bot:hs', ['other']);
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!new:hs');
  });

  it('creates a private, joined-history, tenant-marked room and joins the person', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/directory/room/')) return json({}, false);
      if (url.endsWith('/createRoom')) return json({ room_id: '!new:hs' });
      return json({ user_id: '@bk2-bot:hs' }); // user exists, whoami, invite, join
    });
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!new:hs');
    const create = calls().find((c) => c.url.endsWith('/createRoom'))!;
    const body = JSON.parse(create.init!.body as string);
    expect(body.room_alias_name).toBe('notes_scs_kaiser');
    expect(body.preset).toBe('private_chat');
    expect(body.initial_state).toContainEqual({ type: 'org.okr.tenant', state_key: '', content: { tenants: ['scs'] } });
    expect(body.initial_state).toContainEqual({
      type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' },
    });
    expect(body.name).toBe('notes_scs_kaiser');
    const pl = body.power_level_content_override;
    // room version 12: the creator (bot) must NOT be in users — Synapse rejects it
    expect(body.room_version).toBe('12');
    expect(pl.users).toEqual({ [`@kaiser:${HOST}`]: 50 });
    expect(pl).toMatchObject({ invite: 100, kick: 100, ban: 100, state_default: 100, events_default: 0, redact: 50 });
    for (const type of [
      'm.room.name', 'm.room.canonical_alias', 'm.room.avatar', 'm.room.topic', 'm.room.power_levels',
      'm.room.history_visibility', 'm.room.join_rules', 'org.okr.tenant',
    ]) {
      expect(pl.events[type]).toBe(100);
    }
    const joined = calls()
      .filter((c) => c.url.includes('/admin/v1/join/'))
      .map((c) => JSON.parse(c.init!.body as string).user_id);
    expect(joined).toContain(`@kaiser:${HOST}`);
  });

  it('re-reads the alias when createRoom answers M_ROOM_IN_USE', async () => {
    let lookups = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/directory/room/')) return ++lookups === 1 ? json({}, false) : json({ room_id: '!race:hs' });
      if (url.endsWith('/createRoom')) return json({ errcode: 'M_ROOM_IN_USE' }, false);
      if (url.includes('/account/whoami')) return json({ user_id: '@bk2-bot:hs' });
      if (url.includes('/_synapse/admin/v1/rooms/')) return json({ creator: '@bk2-bot:hs' });
      if (url.includes('/state/org.okr.tenant/')) return json({ tenants: ['scs'] });
      return json({});
    });
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!race:hs');
  });
});
