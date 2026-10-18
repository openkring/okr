import type { MatrixMessage } from '@okr/shared-models';
import { POLL_START_EVENT, parsePollContent } from './poll.util';

/** Custom field on the content of a bookmark entry in the personal notes room. */
export const OKR_BOOKMARK_FIELD = 'org.okr.bookmark';

const SNIPPET_MAX = 200;
const MEDIA_TYPES = ['m.file', 'm.image', 'm.video', 'm.audio'];

export interface ChatBookmark {
  roomId: string;
  eventId: string;
  senderId: string;
  /** Display name of the sender at save time (the original room may not be resolvable later). */
  senderName: string;
  originTs: number;
  roomName: string;
  snippet: string;
}

/** Alias localpart of a person's notes room: one per (person, tenant). */
export function notesRoomAliasLocalpart(tenantId: string, personKey: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9._=-]/g, '_');
  return `notes_${clean(tenantId)}_${clean(personKey)}`;
}

/**
 * Whether an alias (`#notes_scs_kaiser:bkchat.etke.host`) is a notes room alias,
 * optionally of one tenant. Tenant ids may contain `_`, so the tenant is matched as a prefix.
 */
export function isNotesRoomAlias(alias: string | undefined, tenantId?: string): boolean {
  const localpart = alias?.split(':')[0]?.replace(/^#/, '');
  if (!localpart?.startsWith('notes_')) return false;
  return tenantId ? localpart.startsWith(`notes_${tenantId}_`) : true;
}

/** Localpart of the Matrix service account that creates every notes room (`MATRIX_ADMIN_TOKEN`). */
export const NOTES_ROOM_BOT_LOCALPART = 'bk2-bot';

/** Who the notes room must belong to: the signed-in person, in this tenant, on our homeserver. */
export interface NotesRoomOwner {
  tenantId: string;
  personKey: string;
  /** Matrix server name (`bkchat.etke.host`), as in the user's own MXID. */
  serverName: string;
}

/**
 * Whether a room is the caller's own notes room: its canonical alias (carried in `topic`) is
 * exactly `#notes_<tenant>_<personKey>:<server>` AND the bot of OUR homeserver created it
 * (`@bk2-bot:<server>`). Exact comparison, not a prefix: a squatted alias, another person's
 * notes room or a bot of a foreign server never matches.
 */
export function isOwnNotesRoom(room: { topic?: string; creator?: string }, owner: NotesRoomOwner | undefined): boolean {
  if (!owner?.tenantId || !owner.personKey || !owner.serverName) return false;
  const alias = `#${notesRoomAliasLocalpart(owner.tenantId, owner.personKey)}:${owner.serverName}`;
  return room.topic === alias && room.creator === `@${NOTES_ROOM_BOT_LOCALPART}:${owner.serverName}`;
}

/** First 200 chars (code points, whitespace collapsed) of the plain body; a file, image, video or audio shows its name, a poll its question. */
export function bookmarkSnippet(message: MatrixMessage): string {
  if (message.type === POLL_START_EVENT) {
    return truncate(parsePollContent(message.content).question || message.body || '');
  }
  if (MEDIA_TYPES.includes(message.type)) return truncate(`📎 ${message.body ?? ''}`);
  return truncate(message.body ?? '');
}

function truncate(raw: string): string {
  const chars = Array.from(raw.replace(/\s+/g, ' ').trim());
  return chars.length > SNIPPET_MAX ? `${chars.slice(0, SNIPPET_MAX - 1).join('')}…` : chars.join('');
}

export function matrixPermalink(roomId: string, eventId: string): string {
  return `https://matrix.to/#/${roomId}/${eventId}`;
}

/** Content of the entry the bot/user posts into the notes room for a saved message. */
export function buildBookmarkContent(
  message: MatrixMessage,
  roomName: string,
  labels: { saved: string },
): { msgtype: 'm.text'; body: string; [OKR_BOOKMARK_FIELD]: ChatBookmark } {
  const snippet = bookmarkSnippet(message);
  return {
    msgtype: 'm.text',
    body: `${labels.saved} ${roomName} · ${message.senderName}: ${snippet}\n${matrixPermalink(message.roomId, message.eventId)}`,
    [OKR_BOOKMARK_FIELD]: {
      roomId: message.roomId,
      eventId: message.eventId,
      senderId: message.sender,
      senderName: message.senderName,
      originTs: message.timestamp,
      roomName,
      snippet,
    },
  };
}

/**
 * Whether a message carrying the bookmark field may be rendered as a trusted card: only in the
 * user's own notes room and only when the user posted it (any Matrix user can forge the field
 * in a group room, with a fake room name and sender).
 */
export function isTrustedBookmarkEntry(isNotesRoom: boolean, sender: string | undefined, currentUserId: string | undefined): boolean {
  return isNotesRoom && !!sender && !!currentUserId && sender === currentUserId;
}

/** The bookmark field of an event content, or undefined if absent or incomplete. */
export function readBookmark(content: unknown): ChatBookmark | undefined {
  const raw = (content as Record<string, unknown> | null | undefined)?.[OKR_BOOKMARK_FIELD] as Partial<ChatBookmark> | undefined;
  if (!raw || typeof raw.roomId !== 'string' || typeof raw.eventId !== 'string' || !raw.roomId || !raw.eventId) return undefined;
  return {
    roomId: raw.roomId,
    eventId: raw.eventId,
    senderId: typeof raw.senderId === 'string' ? raw.senderId : '',
    senderName: typeof raw.senderName === 'string' && raw.senderName
      ? raw.senderName
      : (typeof raw.senderId === 'string' ? raw.senderId.replace(/^@/, '').split(':')[0] : ''),
    originTs: typeof raw.originTs === 'number' ? raw.originTs : 0,
    roomName: typeof raw.roomName === 'string' ? raw.roomName : '',
    snippet: typeof raw.snippet === 'string' ? raw.snippet : '',
  };
}

/**
 * Parse a `https://matrix.to/#/<room id or alias>[/<event id>]` link to a room or event on OUR
 * homeserver. User links, foreign servers and other hosts give undefined.
 */
export function parseMatrixPermalink(url: string, serverName: string): { roomIdOrAlias: string; eventId?: string } | undefined {
  const m = /^https:\/\/matrix\.to\/#\/([^/?]+)(?:\/([^/?]+))?/.exec(url.trim());
  if (!m) return undefined;
  let roomIdOrAlias: string;
  let eventId: string | undefined;
  try {
    roomIdOrAlias = decodeURIComponent(m[1]);
    eventId = m[2] ? decodeURIComponent(m[2]) : undefined;
  } catch {
    return undefined;
  }
  if (!/^[!#]/.test(roomIdOrAlias)) return undefined;
  if (!roomIdOrAlias.endsWith(`:${serverName}`)) return undefined;
  return eventId ? { roomIdOrAlias, eventId } : { roomIdOrAlias };
}

export type PermalinkResolution =
  | { kind: 'room'; roomId: string }
  | { kind: 'group'; groupKey: string }
  | { kind: 'none' };

/**
 * Where a permalink target leads: a joined room (matched by id, or by canonical alias in the room
 * topic), a not-joined group alias (open through the `selectedRoom` deep link with the group key),
 * or nowhere (unknown id, ask/notes aliases that are not joined).
 */
export function resolvePermalinkTarget(roomIdOrAlias: string, rooms: ReadonlyArray<{ roomId: string; topic?: string }>): PermalinkResolution {
  const alias = roomIdOrAlias.startsWith('#') ? roomIdOrAlias.toLowerCase() : undefined;
  const room = alias
    ? rooms.find(r => r.topic?.split(':').slice(0, 2).join(':').toLowerCase() === alias)
    : rooms.find(r => r.roomId === roomIdOrAlias);
  if (room) return { kind: 'room', roomId: room.roomId };
  const groupKey = alias ? /^#group_([^:]+):/.exec(alias)?.[1] : undefined;
  return groupKey ? { kind: 'group', groupKey } : { kind: 'none' };
}
