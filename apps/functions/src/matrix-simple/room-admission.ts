/**
 * Server-side admission rule for chat rooms WITHOUT an `org.okr.tenant` marker (spec 1.127 2.1).
 *
 * keep in sync with libs/chat/util/src/lib/chat.util.ts: filterRoomsOfTenant
 * (functions cannot import `@okr/chat-util`: its barrel pulls Angular).
 *
 * Marker cases (non-empty, empty) belong to `pusherAdmitsRoom`, not here. Order of rules, as on
 * the client: foreign homeserver -> `#group_` alias / room id -> DM counterpart (bridge ghosts
 * included) -> bridge-bot creator -> admit.
 *
 * The client's `stateLoaded === false` rule has NO server equivalent: it guards the window of
 * the initial sync, in which the client has not received room state yet. The server reads
 * the state from Synapse directly, so the facts are complete or the lookup failed (and then
 * the caller delivers, fail open).
 */
import { BRIDGE_BOT_LOCALPARTS, isBridgeBotId } from './room-assignment';
import { pusherAdmitsRoom } from './shared';

export interface RoomFacts {
  roomId: string;
  /** '#group_x:server' as Synapse reports it */
  canonicalAlias?: string;
  /** '@localpart:server' */
  creator?: string;
  /** '@localpart:server' when the room is a 2-member room without alias */
  directCounterpart?: string;
}

export interface TenantRoomScope {
  groupRoomIds: Set<string>;
  /** 'group_<okey lowercased, sanitised>' (groupRoomAliasLocalpart) */
  groupAliasLocalparts: Set<string>;
  /** lowercased person okeys of the tenant */
  personKeys: Set<string>;
  serverName: string;
}

/** Ghost prefixes (`signal_`, ...) derived from the single server bot list (`signalbot`, ...). */
const BRIDGE_GHOST_PREFIXES = BRIDGE_BOT_LOCALPARTS.map(b => `${b.replace(/bot$/, '')}_`);

function localpartOf(userId: string): string {
  return userId.split(':')[0].replace(/^@/, '').toLowerCase();
}

export function admitsUnmarkedRoom(room: RoomFacts, scope: TenantRoomScope): boolean {
  const domain = room.roomId.split(':').slice(1).join(':');
  if (scope.serverName && domain && domain.toLowerCase() !== scope.serverName.toLowerCase()) return false;

  const alias = room.canonicalAlias?.toLowerCase();
  if (alias?.startsWith('#group_')) {
    return scope.groupRoomIds.has(room.roomId) || scope.groupAliasLocalparts.has(alias.slice(1).split(':')[0]);
  }

  if (room.directCounterpart) {
    const lp = localpartOf(room.directCounterpart);
    return BRIDGE_GHOST_PREFIXES.some(p => lp.startsWith(p)) || scope.personKeys.has(lp);
  }

  if (isBridgeBotId(room.creator)) return false;
  return true;
}

/**
 * The gateway's admission decision for one pusher (spec 1.127 2.1):
 *
 *  - the room carries a marker, or the pusher carries no tenant -> `pusherAdmitsRoom` (spec 1.93 §3);
 *  - unmarked, but the room facts or the tenant scope could not be read -> deliver (fail open:
 *    a Synapse or Firestore hiccup must never drop a member's push);
 *  - unmarked with facts and scope -> `admitsUnmarkedRoom`, the client's room-list rule.
 *
 * Lives here, not in shared.ts: shared.ts must not import this module at runtime (room-assignment
 * imports shared.ts, so the cycle would read a secret before it is defined).
 */
export function decideAdmission(
  roomMarker: string[] | undefined,
  pusherTenant: string | undefined,
  facts: RoomFacts | undefined,
  scope: TenantRoomScope | undefined,
): boolean {
  if (roomMarker !== undefined || !pusherTenant) return pusherAdmitsRoom(roomMarker, pusherTenant);
  if (!facts || !scope) return true;
  return admitsUnmarkedRoom(facts, scope);
}
