import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { ChatReminderDoc, processReminder, REMINDER_PREFIX } from './chat-reminders';
import { roomEventExists, sendBotReply } from './shared';

const doc: ChatReminderDoc = {
  okey: 'r1', tenants: ['scs'], personKey: 'p1', dueAt: 1000, state: 'pending',
  notesRoomId: '!notes:h', bookmarkEventId: '$bm', roomId: '!r:h', eventId: '$ev', title: 'Anna Muster in «Vorstand»',
};

describe('processReminder', () => {
  it('replies to the bookmark when the entry still exists', async () => {
    const deps = { roomEventExists: vi.fn().mockResolvedValue(true), sendBotReply: vi.fn().mockResolvedValue(undefined), token: 't' };
    expect(await processReminder(doc, deps)).toBe('sent');
    expect(deps.roomEventExists).toHaveBeenCalledWith('!notes:h', '$bm', 't');
    expect(deps.sendBotReply).toHaveBeenCalledWith('!notes:h', '$bm', `${REMINDER_PREFIX}: Anna Muster in «Vorstand»`, 'reminder_r1', 't');
    expect(REMINDER_PREFIX).toBe('Erinnerung');
  });
  it('cancels when the entry is gone', async () => {
    const deps = { roomEventExists: vi.fn().mockResolvedValue(false), sendBotReply: vi.fn(), token: 't' };
    expect(await processReminder(doc, deps)).toBe('cancelled');
    expect(deps.sendBotReply).not.toHaveBeenCalled();
  });
  it('propagates a send failure so the reminder stays pending', async () => {
    const deps = { roomEventExists: vi.fn().mockResolvedValue(true), sendBotReply: vi.fn().mockRejectedValue(new Error('boom')), token: 't' };
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
  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'no' }));
    await expect(sendBotReply('!r:h', '$bm', 'hi', 't1', 't')).rejects.toThrow();
  });
});
