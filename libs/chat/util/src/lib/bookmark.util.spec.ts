import { describe, it, expect } from 'vitest';
import type { MatrixMessage } from '@okr/shared-models';
import { OKR_BOOKMARK_FIELD, notesRoomAliasLocalpart, bookmarkSnippet, buildBookmarkContent, readBookmark, isTrustedBookmarkEntry, matrixPermalink, parseMatrixPermalink, isOwnNotesRoom, resolvePermalinkTarget } from './bookmark.util';

const SERVER = 'bkchat.etke.host';

function msg(over: Partial<MatrixMessage> = {}): MatrixMessage {
  return {
    eventId: '$ev1', roomId: '!abc:bkchat.etke.host', sender: '@kaiser:bkchat.etke.host', senderName: 'Bruno',
    body: 'Hallo Welt', timestamp: 1700000000000, type: 'm.text', content: {}, isRedacted: false, isEdited: false,
    ...over,
  };
}

describe('notesRoomAliasLocalpart', () => {
  it('joins tenant and person', () => {
    expect(notesRoomAliasLocalpart('scs', 'kaiser')).toBe('notes_scs_kaiser');
  });

  it('lowercases and replaces unsafe characters', () => {
    expect(notesRoomAliasLocalpart('SCS', 'Ka:ise/r Ü')).toBe('notes_scs_ka_ise_r__');
  });
});

describe('bookmarkSnippet', () => {
  it('truncates long text to 200 chars with an ellipsis', () => {
    const s = bookmarkSnippet(msg({ body: 'a'.repeat(250) }));
    expect(s.length).toBe(200);
    expect(s.endsWith('…')).toBe(true);
  });
  it('keeps short text', () => {
    expect(bookmarkSnippet(msg())).toBe('Hallo Welt');
  });
  it('prefixes files with a paperclip', () => {
    expect(bookmarkSnippet(msg({ type: 'm.file', body: 'offerte.pdf' }))).toBe('📎 offerte.pdf');
  });
  it('prefixes images, videos and audio with a paperclip', () => {
    expect(bookmarkSnippet(msg({ type: 'm.image', body: 'foto.jpg' }))).toBe('📎 foto.jpg');
    expect(bookmarkSnippet(msg({ type: 'm.video', body: 'clip.mp4' }))).toBe('📎 clip.mp4');
    expect(bookmarkSnippet(msg({ type: 'm.audio', body: 'memo.m4a' }))).toBe('📎 memo.m4a');
  });
  it('collapses whitespace and newlines', () => {
    expect(bookmarkSnippet(msg({ body: 'a\n\n  b\t c' }))).toBe('a b c');
  });
  it('does not split an emoji at the truncation boundary', () => {
    const s = bookmarkSnippet(msg({ body: 'a'.repeat(198) + '😀😀😀' }));
    expect(Array.from(s).length).toBe(200);
    expect(s).toBe('a'.repeat(198) + '😀…');
  });
  it('uses the question of a poll', () => {
    const content = { 'org.matrix.msc3381.poll': { question: { body: 'Wann treffen wir uns?' }, answers: [] } };
    expect(bookmarkSnippet(msg({ type: 'org.matrix.msc3381.poll.start', body: 'x', content }))).toBe('Wann treffen wir uns?');
  });
});

describe('matrixPermalink', () => {
  it('builds a matrix.to event link', () => {
    expect(matrixPermalink('!abc:bkchat.etke.host', '$ev1')).toBe('https://matrix.to/#/!abc:bkchat.etke.host/$ev1');
  });
});

describe('buildBookmarkContent / readBookmark', () => {
  it('builds a body with room, sender, snippet and link, and round-trips the field', () => {
    const m = msg();
    const c = buildBookmarkContent(m, 'Vorstand', { saved: 'Gemerkt:' });
    expect(c.msgtype).toBe('m.text');
    expect(c.body).toContain('Gemerkt:');
    expect(c.body).toContain('Vorstand');
    expect(c.body).toContain('Bruno');
    expect(c.body).toContain('Hallo Welt');
    expect(c.body).toContain(matrixPermalink(m.roomId, m.eventId));
    expect(readBookmark(c)).toEqual({
      roomId: m.roomId, eventId: m.eventId, senderId: m.sender, senderName: m.senderName, originTs: m.timestamp, roomName: 'Vorstand', snippet: 'Hallo Welt',
    });
    expect(c[OKR_BOOKMARK_FIELD].eventId).toBe('$ev1');
  });
  it('falls back to the senderId localpart for legacy entries without senderName', () => {
    const r = readBookmark({ [OKR_BOOKMARK_FIELD]: { roomId: '!a:b', eventId: '$e', senderId: '@kaiser:srv', originTs: 1, roomName: 'r', snippet: 's' } });
    expect(r?.senderName).toBe('kaiser');
  });
  it('returns undefined without the field', () => {
    expect(readBookmark({ body: 'x' })).toBeUndefined();
    expect(readBookmark(undefined)).toBeUndefined();
  });
  it('returns undefined when eventId is missing', () => {
    expect(readBookmark({ [OKR_BOOKMARK_FIELD]: { roomId: '!a:b', senderId: '@a:b', originTs: 1, roomName: 'r', snippet: 's' } })).toBeUndefined();
  });
});

describe('parseMatrixPermalink', () => {
  it('parses room id and event id', () => {
    expect(parseMatrixPermalink('https://matrix.to/#/!abc:bkchat.etke.host/$ev1', SERVER)).toEqual({ roomIdOrAlias: '!abc:bkchat.etke.host', eventId: '$ev1' });
  });
  it('decodes a url-encoded alias', () => {
    expect(parseMatrixPermalink('https://matrix.to/#/%23group_x%3Abkchat.etke.host', SERVER)).toEqual({ roomIdOrAlias: '#group_x:bkchat.etke.host' });
    expect(parseMatrixPermalink('https://matrix.to/#/#group_x%3Abkchat.etke.host', SERVER)).toEqual({ roomIdOrAlias: '#group_x:bkchat.etke.host' });
  });
  it('rejects a foreign server', () => {
    expect(parseMatrixPermalink('https://matrix.to/#/!abc:matrix.org/$ev1', SERVER)).toBeUndefined();
  });
  it('rejects user links and non matrix.to urls', () => {
    expect(parseMatrixPermalink('https://matrix.to/#/@kaiser:bkchat.etke.host', SERVER)).toBeUndefined();
    expect(parseMatrixPermalink('https://example.com/#/!abc:bkchat.etke.host', SERVER)).toBeUndefined();
  });
});

describe('isOwnNotesRoom', () => {
  const owner = { tenantId: 'scs', personKey: 'Kaiser', serverName: 'bkchat.etke.host' };
  const alias = '#notes_scs_kaiser:bkchat.etke.host';
  const bot = '@bk2-bot:bkchat.etke.host';
  it('accepts the exact own alias created by the full bot MXID', () => {
    expect(isOwnNotesRoom({ topic: alias, creator: bot }, owner)).toBe(true);
  });
  it('rejects a bot of a foreign server', () => {
    expect(isOwnNotesRoom({ topic: alias, creator: '@bk2-bot:other.server' }, owner)).toBe(false);
  });
  it('rejects a squatted alias created by someone else, or without creator', () => {
    expect(isOwnNotesRoom({ topic: alias, creator: '@mallory:bkchat.etke.host' }, owner)).toBe(false);
    expect(isOwnNotesRoom({ topic: alias }, owner)).toBe(false);
  });
  it("rejects another person's notes alias in the same tenant", () => {
    expect(isOwnNotesRoom({ topic: '#notes_scs_meier:bkchat.etke.host', creator: bot }, owner)).toBe(false);
  });
  it('rejects another tenant, a foreign-server alias or a non-notes alias', () => {
    expect(isOwnNotesRoom({ topic: '#notes_gss_kaiser:bkchat.etke.host', creator: bot }, owner)).toBe(false);
    expect(isOwnNotesRoom({ topic: '#notes_scs_kaiser:other.server', creator: bot }, owner)).toBe(false);
    expect(isOwnNotesRoom({ topic: '#group_x:bkchat.etke.host', creator: bot }, owner)).toBe(false);
    expect(isOwnNotesRoom({ creator: bot }, owner)).toBe(false);
  });
  it('rejects without an owner', () => {
    expect(isOwnNotesRoom({ topic: alias, creator: bot }, undefined)).toBe(false);
  });
});

describe('isTrustedBookmarkEntry', () => {
  it('trusts only the own message in the notes room', () => {
    expect(isTrustedBookmarkEntry(true, '@me:s', '@me:s')).toBe(true);
    expect(isTrustedBookmarkEntry(false, '@me:s', '@me:s')).toBe(false);
    expect(isTrustedBookmarkEntry(true, '@evil:s', '@me:s')).toBe(false);
    expect(isTrustedBookmarkEntry(true, '@me:s', undefined)).toBe(false);
    expect(isTrustedBookmarkEntry(true, undefined, undefined)).toBe(false);
  });
});

describe('resolvePermalinkTarget', () => {
  const rooms = [{ roomId: '!a:s', topic: '#group_x:s' }, { roomId: '!b:s' }];
  it('joined room id', () => expect(resolvePermalinkTarget('!b:s', rooms)).toEqual({ kind: 'room', roomId: '!b:s' }));
  it('alias matching a joined topic', () => expect(resolvePermalinkTarget('#Group_X:s', rooms)).toEqual({ kind: 'room', roomId: '!a:s' }));
  it('not-joined group alias navigates', () => expect(resolvePermalinkTarget('#group_y:s', rooms)).toEqual({ kind: 'group', groupKey: 'y' }));
  it('maps the alias key onto a known mixed-case group okey', () =>
    expect(resolvePermalinkTarget('#group_abc:s', rooms, [{ okey: 'other' }, { okey: 'AbC' }])).toEqual({ kind: 'group', groupKey: 'AbC' }));
  it('maps a sanitised alias key back to its group okey', () =>
    expect(resolvePermalinkTarget('#group_4er_dienstag:s', rooms, [{ okey: '4er Dienstag' }])).toEqual({ kind: 'group', groupKey: '4er Dienstag' }));
  it('unknown id', () => expect(resolvePermalinkTarget('!zz:s', rooms)).toEqual({ kind: 'none' }));
  it('ask/notes not joined', () => {
    expect(resolvePermalinkTarget('#ask_g_p:s', rooms)).toEqual({ kind: 'none' });
    expect(resolvePermalinkTarget('#notes_t_p:s', rooms)).toEqual({ kind: 'none' });
  });
});
