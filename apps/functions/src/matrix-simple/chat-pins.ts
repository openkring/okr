// apps/functions/src/matrix-simple/chat-pins.ts
//
// Shared («Für alle») pins (spec 1.109 §6). The pinned ids live in the Matrix-standard
// `m.room.pinned_events` state, their expiry in `org.okr.pin_expiry` (both state_key '').
// Members of bot-created rooms sit at power level 0 and cannot write either state event, so
// they come here; the bot writes both after checking who may pin.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken,
  requireProvisionedUser,
  checkRateLimit,
  requireParam,
  requireUserPersonKey,
  getCallerRoles,
  getJoinedMemberIds,
  requireRoomInTenant,
  ensureAdminInRoom,
  roomEventExists,
  serverHostname,
  getRoomStateContent,
  getRoomSummary,
  groupRoomAliasLocalpart,
  putRoomStateContent,
  mayPinForAll,
  MATRIX_PINNED_EVENTS,
  OKR_PIN_EXPIRY_EVENT,
  PinRoomKind,
} from './shared';

export type PinOp = 'pin' | 'unpin' | 'cleanup';

/** Upper bound of shared pins per room — keeps the state event far below Matrix's 64 KiB. */
export const MAX_SHARED_PINS = 50;

function validUntil(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/** Expiry of a pinned id; a missing or malformed value means «no expiry» (as on the client). */
function untilOf(expiry: Record<string, unknown>, eventId: string): number | null {
  const v = expiry[eventId];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * The next shared-pin state for one operation. Pure — `setChatPins` only reads, calls this and
 * writes.
 *
 *  - `pin`     (needs `mayPin`): append `eventId` (or keep its place) and set its expiry.
 *  - `unpin`   (needs `mayPin`): remove `eventId`.
 *  - `cleanup` (any member):    remove only ids whose expiry has passed (`until <= now`).
 *
 * The returned expiry map keeps only valid entries of ids that are still pinned; an absent entry
 * means «no expiry», so dropping a malformed one changes nothing for any client.
 */
export function applyPinOp(
  pinned: string[],
  expiry: Record<string, unknown>,
  op: PinOp,
  eventId: string | undefined,
  until: number | null | undefined,
  now: number,
  mayPin: boolean,
): { pinned: string[]; expiry: Record<string, number | null> } {
  let next: string[] = [...pinned];
  const nextExpiry: Record<string, unknown> = { ...expiry };

  if (op === 'cleanup') {
    next = next.filter((id) => {
      const u = untilOf(expiry, id);
      return u === null || u > now;
    });
  } else {
    if (!mayPin) throw new HttpsError('permission-denied', 'You may not change the pins of this room for everyone.');
    if (!eventId) throw new HttpsError('invalid-argument', 'eventId is required');
    if (op === 'pin') {
      const u = until ?? null;
      if (!validUntil(u) || (u !== null && u <= now)) {
        throw new HttpsError('invalid-argument', 'until must be null or in the future');
      }
      if (!next.includes(eventId)) {
        if (next.length >= MAX_SHARED_PINS) {
          throw new HttpsError('resource-exhausted', `A room may have at most ${MAX_SHARED_PINS} shared pins.`);
        }
        next.push(eventId);
      }
      nextExpiry[eventId] = u;
    } else {
      next = next.filter((id) => id !== eventId);
    }
  }

  const prunedExpiry: Record<string, number | null> = {};
  for (const id of next) {
    if (Object.prototype.hasOwnProperty.call(nextExpiry, id) && validUntil(nextExpiry[id])) {
      prunedExpiry[id] = nextExpiry[id] as number | null;
    }
  }
  return { pinned: next, expiry: prunedExpiry };
}

/** The room kind for the pin rule, from the group document that owns the room (none → 'other'). */
/**
 * Group okey named by a room's canonical alias `#group_<okey>:<server>` — the fallback the client
 * uses (`findGroupOfRoom`) when no group carries the room in `matrixRoomId`. Only an alias on
 * this homeserver whose key is already in alias form (`groupRoomAliasLocalpart(key)` round-trips)
 * names a document id directly; anything else is undefined (the room then counts as 'other').
 */
export function groupKeyOfRoomAlias(canonicalAlias: string | undefined, hostname: string): string | undefined {
  const match = /^#(group_[^:]+):(.+)$/.exec(canonicalAlias ?? '');
  if (!match || match[2] !== hostname) return undefined;
  const key = match[1].slice('group_'.length);
  return key && groupRoomAliasLocalpart(key) === match[1] ? key : undefined;
}

function pinKindOfGroup(kind: unknown): PinRoomKind {
  switch (kind ?? 'group') {
    case 'chat': return 'adhoc';
    case 'pinboard': return 'pinboard';
    case 'group': return 'group';
    default: return 'other';
  }
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameExpiry(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

/**
 * Pin, unpin or clean up shared pins of a room on behalf of a member without the power to write
 * the state events (spec 1.109 §6).
 *
 * Checks, in order: provisioned caller, room in the caller's tenant, caller JOINED to the room,
 * and — for `pin`/`unpin` — `mayPinForAll` for the room's kind (from the group document whose
 * `matrixRoomId` is this room, else the one named by the canonical alias `#group_<okey>`; none →
 * 'other', where only `cleanup` is allowed). `cleanup` is open to every member: it can only
 * remove pins whose expiry has already passed.
 *
 * Write order: for `pin` the expiry FIRST, then `pinned` — a failed second write leaves an unused
 * expiry entry, never a permanent pin. For `unpin`/`cleanup` `pinned` first, then the pruned expiry.
 */
export const setChatPins = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ pinned: string[] }> => {
    const uid = await requireProvisionedUser(request, 'setChatPins');
    checkRateLimit(uid, 'setChatPins', 30);

    const { roomId, op, eventId, until } = request.data as {
      roomId?: string; op?: string; eventId?: string; until?: number | null;
    };
    const room = requireParam(roomId, 'roomId', 255);
    if (op !== 'pin' && op !== 'unpin' && op !== 'cleanup') {
      throw new HttpsError('invalid-argument', 'op must be pin, unpin or cleanup');
    }
    const event = op === 'cleanup' ? undefined : requireParam(eventId, 'eventId', 255);
    if (until !== undefined && !validUntil(until)) {
      throw new HttpsError('invalid-argument', 'until must be null or a timestamp in ms');
    }

    const adminToken = matrixAdminToken.value();
    await requireRoomInTenant(room, uid, 'setChatPins', adminToken);

    const personKey = await requireUserPersonKey(uid, 'setChatPins');
    const callerMatrixId = `@${personKey.toLowerCase()}:${serverHostname()}`;
    let members: Set<string>;
    try {
      members = await getJoinedMemberIds(room, adminToken);
    } catch (e) {
      console.error('setChatPins: member lookup failed', e);
      throw new HttpsError('unavailable', 'Room members could not be read.');
    }
    if (!members.has(callerMatrixId)) {
      throw new HttpsError('permission-denied', 'Only members of the room may change its pins.');
    }

    let mayPin = false;
    if (op !== 'cleanup') {
      const db = getFirestore();
      const groups = await db.collection('groups').where('matrixRoomId', '==', room).limit(1).get();
      let group = groups.empty ? undefined : groups.docs[0].data();
      if (!group) {
        // No matrixRoomId on the group doc (older rooms): fall back to the canonical alias, as the client does.
        const aliasKey = groupKeyOfRoomAlias((await getRoomSummary(room, adminToken))?.canonicalAlias, serverHostname());
        const doc = aliasKey ? await db.collection('groups').doc(aliasKey).get() : undefined;
        group = doc?.exists ? doc.data() : undefined;
      }
      const kind = group ? pinKindOfGroup(group['kind']) : 'other';
      const isGroupAdmin = Array.isArray(group?.['admins']) &&
        (group['admins'] as { key?: string }[]).some((a) => a?.key === personKey);
      mayPin = mayPinForAll(kind, await getCallerRoles(uid), isGroupAdmin);
    }

    await ensureAdminInRoom(room, adminToken);
    let current: { pinned: string[]; expiry: Record<string, unknown> };
    try {
      const pinnedContent = await getRoomStateContent(room, MATRIX_PINNED_EVENTS, adminToken);
      const rawPinned = pinnedContent?.['pinned'];
      current = {
        pinned: Array.isArray(rawPinned) ? rawPinned.filter((id): id is string => typeof id === 'string') : [],
        expiry: (await getRoomStateContent(room, OKR_PIN_EXPIRY_EVENT, adminToken)) ?? {},
      };
    } catch (e) {
      // Never write after a failed read: «unreadable» must not become «no pins».
      console.error('setChatPins: reading the pin state failed', e);
      throw new HttpsError('unavailable', 'The pins could not be read.');
    }

    const now = Date.now();
    const next = applyPinOp(current.pinned, current.expiry, op, event, until, now, mayPin);

    if (op === 'pin' && event && !(await roomEventExists(room, event, adminToken).catch(() => false))) {
      throw new HttpsError('not-found', 'Message not found.');
    }

    const pinnedChanged = !sameStrings(next.pinned, current.pinned);
    const expiryChanged = !sameExpiry(next.expiry, current.expiry);
    try {
      if (op === 'pin') {
        if (expiryChanged) await putRoomStateContent(room, OKR_PIN_EXPIRY_EVENT, next.expiry, adminToken);
        if (pinnedChanged) await putRoomStateContent(room, MATRIX_PINNED_EVENTS, { pinned: next.pinned }, adminToken);
      } else {
        if (pinnedChanged) await putRoomStateContent(room, MATRIX_PINNED_EVENTS, { pinned: next.pinned }, adminToken);
        if (expiryChanged) await putRoomStateContent(room, OKR_PIN_EXPIRY_EVENT, next.expiry, adminToken);
      }
    } catch (e) {
      console.error('setChatPins: writing the pin state failed', e);
      throw new HttpsError('internal', 'The pins could not be saved.');
    }

    console.log(`setChatPins: ${op} in ${room} by ${personKey} → ${next.pinned.length} pinned`);
    return { pinned: next.pinned };
  }
);
