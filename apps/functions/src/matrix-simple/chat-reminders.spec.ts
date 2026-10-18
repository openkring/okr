import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { ChatReminderDoc, processReminder, REMINDER_PREFIX } from './chat-reminders';
import { MatrixTerminalError, roomEventExists, sendBotReply } from './shared';

const doc: ChatReminderDoc = {
  okey: 'r1', tenants: ['scs'], personKey: 'p1', dueAt: 1000, state: 'pending',
  notesRoomId: '!notes:h', bookmarkEventId: '$bm', roomId: '!r:h', eventId: '$ev', title: 'Anna Muster in «Vorstand»',
};

const HOST = 'bkchat.etke.host';
function mkDeps(over: Record<string, unknown> = {}) {
  return {
    getRoomEvent: vi.fn().mockResolvedValue({ sender: `@p1:${HOST}`, content: { body: 'x' } }),
    sendBotReply: vi.fn().mockResolvedValue(undefined),
    resolveRoomAlias: vi.fn().mockResolvedValue('!notes:h'),
    isOwnNotesRoom: vi.fn().mockResolvedValue(true),
    host: HOST, token: 't', ...over,
  };
}

describe('processReminder', () => {
  it('replies to the bookmark when room and entry are the owner\'s', async () => {
    const deps = mkDeps();
    expect(await processReminder(doc, deps)).toBe('sent');
    expect(deps.resolveRoomAlias).toHaveBeenCalledWith(`#notes_scs_p1:${HOST}`, 't');
    expect(deps.isOwnNotesRoom).toHaveBeenCalledWith('!notes:h', 'scs', 't');
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
  it('propagates a retryable send failure so the reminder stays pending', async () => {
    const deps = mkDeps({ sendBotReply: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(processReminder(doc, deps)).rejects.toThrow('boom');
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
