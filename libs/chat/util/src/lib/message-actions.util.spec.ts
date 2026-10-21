import { describe, expect, it } from 'vitest';

import { getMessageActions, MessageActionsCtx, QUICK_REACTIONS } from './message-actions.util';

const BASE: MessageActionsCtx = {
  isAuthor: false,
  isPoll: false,
  pollEnded: false,
  inNotes: false,
  isBookmarkEntry: false,
  isKiosk: false,
  isBookmarked: false,
  hasFileMedia: false,
  isNative: false,
  isPinned: false,
  isRedacted: false,
};

const run = (patch: Partial<MessageActionsCtx> = {}) => {
  const a = getMessageActions({ ...BASE, ...patch });
  return { reactions: a.reactions, tiles: a.tiles.map((x) => x.id), list: a.list.map((x) => x.id), danger: a.danger.map((x) => x.id) };
};

describe('getMessageActions', () => {
  it('offers the full set on someone else\'s message', () => {
    expect(run()).toEqual({
      reactions: true,
      tiles: ['reply', 'forward', 'copy', 'bookmark'],
      list: ['thread', 'pin', 'bookmark.remind', 'unreadFromHere', 'info'],
      danger: ['report'],
    });
  });

  it('marks danger entries', () => {
    expect(getMessageActions(BASE).danger).toEqual([{ id: 'report', danger: true }]);
  });

  it('offers edit and delete on own messages, without unreadFromHere', () => {
    const a = run({ isAuthor: true });
    expect(a.reactions).toBe(true);
    expect(a.tiles).toContain('reply');
    expect(a.list).toContain('thread');
    expect(a.list).not.toContain('unreadFromHere');
    expect(a.danger).toEqual(['edit', 'delete']);
  });

  it('puts poll management first on an own running poll and drops edit', () => {
    const a = run({ isAuthor: true, isPoll: true });
    expect(a.list.slice(0, 3)).toEqual(['poll.results', 'poll.edit', 'poll.end']);
    expect(a.danger).toEqual(['delete']);
  });

  it('only shows poll results once a poll has ended', () => {
    const a = run({ isAuthor: true, isPoll: true, pollEnded: true });
    expect(a.list).toContain('poll.results');
    expect(a.list).not.toContain('poll.edit');
    expect(a.list).not.toContain('poll.end');
  });

  it('keeps notes personal', () => {
    expect(run({ inNotes: true, isAuthor: true })).toEqual({
      reactions: false,
      tiles: ['forward', 'copy'],
      list: ['pin', 'info'],
      danger: ['edit', 'delete'],
    });
  });

  it('shows a bookmark entry with open, reminder and delete only', () => {
    expect(run({ isBookmarkEntry: true })).toEqual({
      reactions: false,
      tiles: [],
      list: ['bookmark.open', 'bookmark.reminder'],
      danger: ['delete'],
    });
  });

  it('replies privately or to all on a pinboard, with no thread', () => {
    const a = run({ pinboard: { allowReplyAll: true } });
    expect(a.tiles.slice(0, 2)).toEqual(['reply.private', 'reply.all']);
    expect(a.list).not.toContain('thread');
  });

  it('omits reply-all on a pinboard that does not allow it', () => {
    const a = run({ pinboard: { allowReplyAll: false } });
    expect(a.tiles).toContain('reply.private');
    expect(a.tiles).not.toContain('reply.all');
  });

  it('offers no reply tile and no thread to the author on a pinboard', () => {
    const a = run({ pinboard: { allowReplyAll: true }, isAuthor: true });
    expect(a.tiles.filter((t) => t.startsWith('reply'))).toEqual([]);
    expect(a.list).not.toContain('thread');
  });

  it('strips personal and sharing actions for a kiosk user', () => {
    const a = run({ isKiosk: true });
    for (const id of ['bookmark', 'bookmark.remind', 'pin', 'forward', 'info']) {
      expect([...a.tiles, ...a.list]).not.toContain(id);
    }
  });

  it('hides bookmark and remind when already bookmarked', () => {
    const a = run({ isBookmarked: true });
    expect(a.tiles).not.toContain('bookmark');
    expect(a.list).not.toContain('bookmark.remind');
  });

  it('offers unpin instead of pin on a pinned message', () => {
    const a = run({ isPinned: true });
    expect(a.list).toContain('unpin');
    expect(a.list).not.toContain('pin');
  });

  it('offers share and download for file media on the web, before info', () => {
    const a = run({ hasFileMedia: true });
    expect(a.list.slice(-3)).toEqual(['share', 'download', 'info']);
  });

  it('offers only share for file media on native', () => {
    const a = run({ hasFileMedia: true, isNative: true });
    expect(a.list).toContain('share');
    expect(a.list).not.toContain('download');
  });

  it('does not forward polls', () => {
    expect(run({ isPoll: true }).tiles).not.toContain('forward');
  });

  it('offers no reactions, forward or copy on a redacted message', () => {
    const a = run({ isRedacted: true });
    expect(a.reactions).toBe(false);
    expect(a.tiles).not.toContain('forward');
    expect(a.tiles).not.toContain('copy');
  });
});

describe('QUICK_REACTIONS', () => {
  it('is the fixed set', () => {
    expect(QUICK_REACTIONS).toEqual(['👍', '❤️', '😂', '😮', '🙏', '🎉']);
  });
});
