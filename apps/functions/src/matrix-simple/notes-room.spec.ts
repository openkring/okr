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

  it('returns the existing room without creating one', async () => {
    fetchMock.mockResolvedValueOnce(json({ room_id: '!old:hs' }));
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!old:hs');
    expect(calls().some((c) => c.url.endsWith('/createRoom'))).toBe(false);
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
    expect(body.power_level_content_override.users[`@kaiser:${HOST}`]).toBe(50);
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
      return json({});
    });
    expect(await ensureNotesRoom('scs', 'kaiser', HOST, 'tok')).toBe('!race:hs');
  });
});
