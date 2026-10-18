import { describe, it, expect } from 'vitest';
import type { MatrixMessage } from '@okr/shared-models';
import { OKR_BOOKMARK_FIELD, notesRoomAliasLocalpart, isNotesRoomAlias, bookmarkSnippet, buildBookmarkContent, readBookmark, matrixPermalink, parseMatrixPermalink } from './bookmark.util';

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
});

describe('isNotesRoomAlias', () => {
  it('matches a notes alias of the tenant', () => {
    expect(isNotesRoomAlias('#notes_scs_kaiser:bkchat.etke.host', 'scs')).toBe(true);
  });
  it('rejects another tenant', () => {
    expect(isNotesRoomAlias('#notes_scs_kaiser:bkchat.etke.host', 'p13')).toBe(false);
  });
  it('matches any tenant without a tenantId', () => {
    expect(isNotesRoomAlias('#notes_scs_kaiser:bkchat.etke.host')).toBe(true);
  });
  it('rejects non-notes aliases and undefined', () => {
    expect(isNotesRoomAlias('#group_x:bkchat.etke.host', 'scs')).toBe(false);
    expect(isNotesRoomAlias(undefined)).toBe(false);
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
      roomId: m.roomId, eventId: m.eventId, senderId: m.sender, originTs: m.timestamp, roomName: 'Vorstand', snippet: 'Hallo Welt',
    });
    expect(c[OKR_BOOKMARK_FIELD].eventId).toBe('$ev1');
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
