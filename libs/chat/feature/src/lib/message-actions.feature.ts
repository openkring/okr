import { MatrixMessage } from '@okr/shared-models';
import { MatrixChatI18n, MessageActionsCtx } from '@okr/chat-util';
import type { MessageActionLabels } from '@okr/chat-ui';

/**
 * Message sheet wiring (spec 1.109 §3): the context `getMessageActions` decides on, and the
 * resolved labels the `MessageActionsSheet` shows. Visibility itself lives in the util.
 */

/** What the context is derived from — read by the caller from the store and the event. */
export interface MessageActionsInputs {
  message: MatrixMessage;
  currentUserId: string | undefined;
  inNotes: boolean;
  /** The message is a trusted bookmark card in the own notes room. */
  isBookmarkEntry: boolean;
  pinboard?: { allowReplyAll?: boolean };
  isKiosk: boolean;
  isBookmarked: boolean;
  isNative: boolean;
  /** Pinned in any scope (personal or shared). */
  isPinned: boolean;
}

export function buildMessageActionsCtx(i: MessageActionsInputs): MessageActionsCtx {
  const m = i.message;
  // m.video belongs here too: a video used to travel as m.file. Images have their own lightbox.
  const hasFileMedia = (m.type === 'm.file' || m.type === 'm.video') && !!(m.mediaUrl ?? m.content?.url);
  return {
    isAuthor: !!i.currentUserId && m.sender === i.currentUserId,
    isPoll: m.type === 'org.matrix.msc3381.poll.start',
    pollEnded: !!m.pollEnded,
    inNotes: i.inNotes,
    isBookmarkEntry: i.isBookmarkEntry,
    pinboard: i.pinboard ? { allowReplyAll: i.pinboard.allowReplyAll ?? false } : undefined,
    isKiosk: i.isKiosk,
    isBookmarked: i.isBookmarked,
    hasFileMedia,
    isNative: i.isNative,
    isPinned: i.isPinned,
    isRedacted: !!m.isRedacted,
  };
}

export function buildMessageActionLabels(i18n: MatrixChatI18n): MessageActionLabels {
  return {
    'reply': i18n.msg_reply(),
    'reply.private': i18n.pinboard_reply_private(),
    'reply.all': i18n.pinboard_reply_all(),
    'thread': i18n.thread_open(),
    'forward': i18n.msg_forward(),
    'copy': i18n.msg_copy(),
    'bookmark': i18n.bookmark_action(),
    'bookmark.remind': i18n.bookmark_remind_action(),
    'pin': i18n.pin_action(),
    'unpin': i18n.unpin_action(),
    'unreadFromHere': i18n.unread_from_here_action(),
    'share': i18n.msg_share(),
    'download': i18n.msg_download(),
    'info': i18n.info_title(),
    'edit': i18n.msg_edit(),
    'delete': i18n.msg_delete(),
    'report': i18n.msg_report_header(),
    'poll.results': i18n.results_title(),
    'poll.edit': i18n.survey_edit(),
    'poll.end': i18n.survey_end(),
    'bookmark.open': i18n.bookmark_open(),
    'bookmark.reminder': i18n.reminder_action(),
    section: i18n.sheet_section_message(),
    moreReactions: i18n.msg_react_header(),
  };
}
