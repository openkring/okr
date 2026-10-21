/**
 * Which actions the message sheet offers (spec 1.109 §3). Pure: the caller derives the context
 * from the event and the room; this decides what is shown and in which order.
 */

export type MessageActionId =
  | 'reply' | 'reply.private' | 'reply.all' | 'thread' | 'forward' | 'copy' | 'bookmark' | 'bookmark.remind'
  | 'pin' | 'unpin' | 'unreadFromHere' | 'share' | 'download' | 'info' | 'edit' | 'delete' | 'report'
  | 'poll.results' | 'poll.edit' | 'poll.end' | 'bookmark.open' | 'bookmark.reminder';

export interface MessageAction {
  id: MessageActionId;
  danger?: boolean;
}

export interface MessageActionsCtx {
  isAuthor: boolean;
  isPoll: boolean;
  pollEnded: boolean;
  inNotes: boolean;
  isBookmarkEntry: boolean;
  pinboard?: { allowReplyAll: boolean };
  isKiosk: boolean;
  isBookmarked: boolean;
  hasFileMedia: boolean;
  isNative: boolean;
  isPinned: boolean;
  isRedacted: boolean;
}

export interface MessageActions {
  reactions: boolean;
  tiles: MessageAction[];
  list: MessageAction[];
  danger: MessageAction[];
}

export const QUICK_REACTIONS: readonly string[] = ['👍', '❤️', '😂', '😮', '🙏', '🎉'];

function actions(ids: (MessageActionId | false)[], danger = false): MessageAction[] {
  return ids.filter((id): id is MessageActionId => id !== false).map((id) => (danger ? { id, danger: true } : { id }));
}

export function getMessageActions(ctx: MessageActionsCtx): MessageActions {
  if (ctx.isBookmarkEntry) {
    return {
      reactions: false,
      tiles: [],
      list: actions(['bookmark.open', !ctx.isKiosk && 'bookmark.reminder']),
      danger: actions(['delete'], true),
    };
  }

  const social = !ctx.inNotes;
  const pinboard = ctx.pinboard;
  const canForward = !ctx.isKiosk && !ctx.isPoll && !ctx.isRedacted;

  const tiles = actions([
    social && !!pinboard && !ctx.isAuthor && 'reply.private',
    social && !!pinboard && !ctx.isAuthor && pinboard.allowReplyAll && 'reply.all',
    social && !pinboard && 'reply',
    canForward && 'forward',
    !ctx.isRedacted && 'copy',
    social && !ctx.isKiosk && !ctx.isBookmarked && 'bookmark',
  ]);

  const pollOwner = ctx.isPoll && ctx.isAuthor && !ctx.pollEnded;
  const list = actions([
    ctx.isPoll && 'poll.results',
    pollOwner && 'poll.edit',
    pollOwner && 'poll.end',
    social && !pinboard && 'thread',
    !ctx.isKiosk && (ctx.isPinned ? 'unpin' : 'pin'),
    social && !ctx.isKiosk && !ctx.isBookmarked && 'bookmark.remind',
    social && !ctx.isAuthor && !ctx.isKiosk && 'unreadFromHere',
    ctx.hasFileMedia && 'share',
    ctx.hasFileMedia && !ctx.isNative && 'download',
    !ctx.isKiosk && 'info',
  ]);

  const danger = ctx.isAuthor
    ? actions([!ctx.isPoll && 'edit', 'delete'], true)
    : social
      ? actions(['report'], true)
      : [];

  return { reactions: social && !ctx.isRedacted, tiles, list, danger };
}
