import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { ChatReminderDoc, handleDueReminder, MAX_FAILURES, processReminder, REMINDER_PREFIX, storedFailures } from './chat-reminders';
import { MatrixTerminalError, resolveRoomAlias, roomEventExists, sendBotReply } from './shared';
import { isOwnNotesRoom } from './notes-room';

const doc: ChatReminderDoc = {
  okey: 'r1', tenants: ['scs'], personKey: 'p1', dueAt: 1000, state: 'pending',
  notesRoomId: '!notes:h', bookmarkEventId: '$bm', roomId: '!r:h', eventId: '$ev', title: 'Anna Muster in «Vorstand»',
};

const HOST = 'bkchat.etke.host';
const BOT = `@bk2-bot:${HOST}`;
function mkDeps(over: Record<string, unknown> = {}) {
  return {
    getRoomEvent: vi.fn().mockResolvedValue({ sender: `@p1:${HOST}`, content: { body: 'x' } }),
    sendBotReply: vi.fn().mockResolvedValue(undefined),
    resolveRoomAlias: vi.fn().mockResolvedValue('!notes:h'),
    isOwnNotesRoom: vi.fn().mockResolvedValue(true),
    getJoinedMemberIds: vi.fn().mockResolvedValue(new Set([BOT, `@p1:${HOST}`])),
    host: HOST, token: 't', botUserId: BOT, ...over,
  };
}

describe('processReminder', () => {
  it('replies to the bookmark when room and entry are the owner\'s', async () => {
    const deps = mkDeps();
    expect(await processReminder(doc, deps)).toBe('sent');
    expect(deps.resolveRoomAlias).toHaveBeenCalledWith(`#notes_scs_p1:${HOST}`, 't', { strict: true });
    expect(deps.isOwnNotesRoom).toHaveBeenCalledWith('!notes:h', 'scs', 't', { strict: true, botUserId: BOT });
    expect(deps.getJoinedMemberIds).toHaveBeenCalledWith('!notes:h', 't');
    expect(deps.sendBotReply).toHaveBeenCalledWith('!notes:h', '$bm', `${REMINDER_PREFIX}: Anna Muster in «Vorstand»`, 'reminder_r1', 't');
    expect(REMINDER_PREFIX).toBe('Erinnerung');
  });
  it('cancels when the entry is gone', async () => {
    const deps = mkDeps({ getRoomEvent: vi.fn().mockResolvedValue(undefined) });
    expect(await processReminder(doc, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('cancels when notesRoomId is not the owner alias target', async () => {
    const deps = mkDeps({ resolveRoomAlias: vi.fn().mockResolvedValue('!other:h') });
    expect(await processReminder(doc, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('cancels when the room is not an own notes room', async () => {
    const deps = mkDeps({ isOwnNotesRoom: vi.fn().mockResolvedValue(false) });
    expect(await processReminder(doc, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('cancels when the entry was sent by someone else', async () => {
    const deps = mkDeps({ getRoomEvent: vi.fn().mockResolvedValue({ sender: `@evil:${HOST}`, content: { body: 'x' } }) });
    expect(await processReminder(doc, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('cancels a doc without exactly one tenant', async () => {
    const deps = mkDeps();
    expect(await processReminder({ ...doc, tenants: ['scs', 'x'] }, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('truncates a long title', async () => {
    const deps = mkDeps();
    await processReminder({ ...doc, title: 'a'.repeat(500) }, deps);
    expect(deps.sendBotReply.mock.calls[0][2]).toBe(`Erinnerung: ${'a'.repeat(200)}`);
  });
  it('cancels on a terminal Matrix error (403)', async () => {
    const deps = mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new MatrixTerminalError('403')) });
    expect(await processReminder(doc, deps)).toBe('cancelled');
  });
  it('cancels when the room holds a third member', async () => {
    const deps = mkDeps({ getJoinedMemberIds: vi.fn().mockResolvedValue(new Set([BOT, `@p1:${HOST}`, `@evil:${HOST}`])) });
    expect(await processReminder(doc, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('cancels when the owner is not joined', async () => {
    const deps = mkDeps({ getJoinedMemberIds: vi.fn().mockResolvedValue(new Set([BOT, `@evil:${HOST}`])) });
    expect(await processReminder(doc, deps)).toBe('cancelled');
  });
  it('throws when the member lookup fails (503), so the sweep retries', async () => {
    const deps = mkDeps({ getJoinedMemberIds: vi.fn().mockRejectedValue(new Error('getJoinedMemberIds: 503')) });
    await expect(processReminder(doc, deps)).rejects.toThrow('503');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('propagates a retryable send failure so the reminder stays pending', async () => {
    const deps = mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(processReminder(doc, deps)).rejects.toThrow('boom');
  });
});

describe('handleDueReminder', () => {
  const snap = (data: Partial<ChatReminderDoc>) => {
    const update = vi.fn().mockResolvedValue(undefined);
    return { snap: { id: 'r1', data: () => ({ ...doc, ...data }), ref: { update } }, update };
  };
  it('writes the outcome state', async () => {
    const { snap: s, update } = snap({});
    expect(await handleDueReminder(s, mkDeps())).toBe('sent');
    expect(update).toHaveBeenCalledWith({ state: 'sent' });
  });
  it('increments failures on a retryable failure and keeps the reminder pending', async () => {
    const { snap: s, update } = snap({ failures: 3 });
    expect(await handleDueReminder(s, mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) }))).toBe('failed');
    expect(update).toHaveBeenCalledWith({ failures: 4 });
  });
  it('counts from zero on a doc without failures', async () => {
    const { snap: s, update } = snap({});
    await handleDueReminder(s, mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) }));
    expect(update).toHaveBeenCalledWith({ failures: 1 });
  });
  it('treats a negative stored counter as 0', async () => {
    const { snap: s, update } = snap({ failures: -1_000_000 });
    await handleDueReminder(s, mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) }));
    expect(update).toHaveBeenCalledWith({ failures: 1 });
  });
  it('treats a non-number stored counter as 0', async () => {
    const { snap: s, update } = snap({ failures: '-5' as unknown as number });
    await handleDueReminder(s, mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) }));
    expect(update).toHaveBeenCalledWith({ failures: 1 });
  });
  it('storedFailures sanitises', () => {
    expect(storedFailures(3.9)).toBe(3);
    expect(storedFailures(-2)).toBe(0);
    expect(storedFailures(Number.NaN)).toBe(0);
    expect(storedFailures(Number.POSITIVE_INFINITY)).toBe(0);
    expect(storedFailures(undefined)).toBe(0);
  });
  it('cancels on the 12th failure', async () => {
    expect(MAX_FAILURES).toBe(12);
    const { snap: s, update } = snap({ failures: 11 });
    expect(await handleDueReminder(s, mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) }))).toBe('cancelled');
    expect(update).toHaveBeenCalledWith({ failures: 12, state: 'cancelled' });
  });
});

describe('strict ownership reads', () => {
  const res = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body, text: async () => '' });
  it('alias 404 resolves undefined; 503 throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(404)));
    expect(await resolveRoomAlias('#a:h', 't', { strict: true })).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(503)));
    await expect(resolveRoomAlias('#a:h', 't', { strict: true })).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(503)));
    expect(await resolveRoomAlias('#a:h', 't')).toBeUndefined();
  });
  it('room details 500 throws in strict mode, false otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(200, { user_id: '@bot:h' })).mockResolvedValueOnce(res(500)));
    await expect(isOwnNotesRoom('!n:h', 'scs', 't', { strict: true })).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(200, { user_id: '@bot:h' })).mockResolvedValueOnce(res(500)));
    expect(await isOwnNotesRoom('!n:h', 'scs', 't')).toBe(false);
  });
  it('a passed botUserId skips whoami', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200, { creator: '@bot:h' }))
      .mockResolvedValueOnce(res(200, { tenants: ['scs'] }));
    vi.stubGlobal('fetch', f);
    expect(await isOwnNotesRoom('!n:h', 'scs', 't', { strict: true, botUserId: '@bot:h' })).toBe(true);
    expect(f.mock.calls.some(([url]) => String(url).includes('whoami'))).toBe(false);
  });
  it('foreign creator is a definite false in strict mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(200, { user_id: '@bot:h' })).mockResolvedValueOnce(res(200, { creator: '@x:h' })));
    expect(await isOwnNotesRoom('!n:h', 'scs', 't', { strict: true })).toBe(false);
  });
  it('processReminder: lookup failures propagate, alias 404 cancels', async () => {
    await expect(processReminder(doc, mkDeps({ resolveRoomAlias: vi.fn().mockRejectedValue(new Error('503')) }))).rejects.toThrow('503');
    expect(await processReminder(doc, mkDeps({ resolveRoomAlias: vi.fn().mockResolvedValue(undefined) }))).toBe('cancelled');
    await expect(processReminder(doc, mkDeps({ isOwnNotesRoom: vi.fn().mockRejectedValue(new Error('500')) }))).rejects.toThrow('500');
  });
});

describe('roomEventExists', () => {
  const res = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  it('true for a live event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { content: { body: 'x' } })));
    expect(await roomEventExists('!r:h', '$e', 't')).toBe(true);
  });
  it('false on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(404, { errcode: 'M_NOT_FOUND' })));
    expect(await roomEventExists('!r:h', '$e', 't')).toBe(false);
  });
  it('false for a redacted event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { content: {}, unsigned: { redacted_because: {} } })));
    expect(await roomEventExists('!r:h', '$e', 't')).toBe(false);
  });
  it('throws on 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(502, {})));
    await expect(roomEventExists('!r:h', '$e', 't')).rejects.toThrow();
  });
});

describe('sendBotReply', () => {
  it('PUTs an m.text rich reply with the txn id', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', f);
    await sendBotReply('!r:h', '$bm', 'hi', 'reminder_r1', 't');
    const [url, init] = f.mock.calls[0];
    expect(url).toContain('/rooms/!r%3Ah/send/m.room.message/reminder_r1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ msgtype: 'm.text', body: 'hi', 'm.relates_to': { 'm.in_reply_to': { event_id: '$bm' } } });
  });
  it('throws a terminal error on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '{"errcode":"M_FORBIDDEN"}' }));
    await expect(sendBotReply('!r:h', '$bm', 'hi', 't1', 't')).rejects.toBeInstanceOf(MatrixTerminalError);
  });
  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'no' }));
    await expect(sendBotReply('!r:h', '$bm', 'hi', 't1', 't')).rejects.toThrow();
  });
});
