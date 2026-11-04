import { describe, expect, it } from 'vitest';

import {
  capMessages, CHAT_EMAIL_MAX_MESSAGES, CHAT_EMAIL_MAX_TEXT_CHARS, digestMessages, digestOutboxId, mayChangeEmailDelivery,
  messagesForMember, readUpTo, RoomEvent, wantsEmail,
} from './chat-email.logic';

const BOT = '@bot:x';
const msg = (id: string, ts: number, content: Record<string, unknown>, sender = '@a:x'): RoomEvent =>
  ({ event_id: id, type: 'm.room.message', sender, origin_server_ts: ts, content });
const text = (body: string) => ({ msgtype: 'm.text', body });

describe('mayChangeEmailDelivery', () => {
  it('follows §3', () => {
    expect(mayChangeEmailDelivery('direct', {}, false)).toBe(true);
    expect(mayChangeEmailDelivery('adhoc', {}, false)).toBe(true);
    expect(mayChangeEmailDelivery('group', {}, false)).toBe(false);
    expect(mayChangeEmailDelivery('group', {}, true)).toBe(true);
    expect(mayChangeEmailDelivery('group', { privileged: true }, false)).toBe(true);
    expect(mayChangeEmailDelivery('notes', { admin: true }, true)).toBe(false);
    expect(mayChangeEmailDelivery('other', { admin: true }, true)).toBe(false);
  });
});

describe('digestMessages', () => {
  it('keeps the window, oldest first, and only readable messages of people', () => {
    const lines = digestMessages([
      msg('later', 300, text('zu neu')),
      msg('b', 200, text('zwei')),
      msg('a', 150, text('eins')),
      msg('old', 100, text('schon erledigt')),
      msg('bot', 160, text('notiz'), BOT),
      msg('edit', 170, { ...text('* neu'), 'm.relates_to': { rel_type: 'm.replace' } }),
      msg('gone', 180, {}),
      { event_id: 'enc', type: 'm.room.encrypted', sender: '@a:x', origin_server_ts: 190, content: { ciphertext: 'x' } },
    ], 100, 200, BOT);
    expect(lines.map((l) => l.eventId)).toEqual(['a', 'b']);
  });

  it('turns media into a line, never a link to the file', () => {
    const [line] = digestMessages([msg('p', 150, { msgtype: 'm.image', body: 'ferien.jpg', url: 'mxc://x/y' })], 100, 200, BOT);
    expect(line.text).toBe('Bild im Chat');
  });

  it('drops the quoted lines of a reply and cuts long text', () => {
    const [reply, long] = digestMessages([
      msg('r', 150, text('> <@b:x> Frage\n\nAntwort')),
      msg('l', 160, text('x'.repeat(CHAT_EMAIL_MAX_TEXT_CHARS + 5))),
    ], 100, 200, BOT);
    expect(reply.text).toBe('Antwort');
    expect(long.text.length).toBe(CHAT_EMAIL_MAX_TEXT_CHARS);
  });
});

describe('readUpTo + messagesForMember', () => {
  const events = [msg('a', 150, text('eins')), msg('b', 200, text('zwei'))];
  const messages = digestMessages(events, 100, 200, BOT);

  it('takes the newest receipt and ignores events outside the run', () => {
    const read = readUpTo([{ a: { 'm.read': { '@b:x': {} } }, b: { 'm.read': { '@b:x': {} } }, unknown: { 'm.read': { '@c:x': {} } } }], events);
    expect(read.get('@b:x')).toBe(200);
    expect(read.has('@c:x')).toBe(false);
  });

  it('leaves out own and already read messages', () => {
    expect(messagesForMember(messages, '@a:x', 0)).toEqual([]);
    expect(messagesForMember(messages, '@b:x', 150).map((m) => m.eventId)).toEqual(['b']);
    expect(messagesForMember(messages, '@b:x', 0)).toHaveLength(2);
  });
});

describe('capMessages', () => {
  it('keeps the newest and counts the rest', () => {
    const many = Array.from({ length: CHAT_EMAIL_MAX_MESSAGES + 3 }, (_, i) => ({ eventId: `${i}`, sender: '@a:x', ts: i, text: 't' }));
    const { shown, more } = capMessages(many);
    expect(more).toBe(3);
    expect(shown[0].eventId).toBe('3');
    expect(shown).toHaveLength(CHAT_EMAIL_MAX_MESSAGES);
  });
});

describe('wantsEmail', () => {
  it('reads newsDelivery', () => {
    expect(wantsEmail(['email'])).toBe(true);
    expect(wantsEmail(['chat'])).toBe(false);
  });
});

describe('digestOutboxId', () => {
  it('is stable per room, recipient and cursor', () => {
    expect(digestOutboxId('!r:x', 'p', 1)).toBe(digestOutboxId('!r:x', 'p', 1));
    expect(digestOutboxId('!r:x', 'p', 1)).not.toBe(digestOutboxId('!r:x', 'p', 2));
    expect(digestOutboxId('!r:x', 'p', 1)).toMatch(/^chat-email_[0-9a-f]{40}$/);
  });
});
