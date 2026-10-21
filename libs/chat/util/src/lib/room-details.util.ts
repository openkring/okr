/**
 * What the Chat-Details page offers per room kind (spec 1.109 §8). Pure: tiles, members mode
 * and the bottom actions follow from the room kind, the caller's roles and the pin count.
 */

export type RoomKind = 'dm' | 'group' | 'adhoc' | 'pinboard' | 'notes' | 'support' | 'other';

export interface RoomDetailsCtx {
  kind: RoomKind;
  isAdmin: boolean;
  isPrivileged: boolean;
  isGroupAdmin: boolean;
  isCreator: boolean;
  isOperatorView?: boolean;
  activePinCount: number;
}

export type RoomTile = 'mute' | 'pins' | 'help';
export type RoomMembersMode = 'none' | 'readonly' | 'counterpart' | 'manage';

export interface RoomDetailsSections {
  tiles: RoomTile[];
  members: RoomMembersMode;
  canInvite: boolean;
  canRemoveMembers: boolean;
  hide: boolean;
  archive: boolean;
  archiveViaGroup: boolean;
  leave: boolean;
  pinForAll: boolean;
}

const MEMBERS: Record<RoomKind, RoomMembersMode> = {
  dm: 'counterpart',
  group: 'readonly',
  pinboard: 'readonly',
  adhoc: 'manage',
  notes: 'none',
  support: 'none',
  other: 'readonly',
};

export function getRoomDetailsSections(ctx: RoomDetailsCtx): RoomDetailsSections {
  const { kind } = ctx;
  const adhoc = kind === 'adhoc';
  const protectedRoom = kind === 'notes' || kind === 'support';
  const groupLevel = ctx.isGroupAdmin || ctx.isPrivileged || ctx.isAdmin;

  const tiles: RoomTile[] = [];
  if (kind !== 'support') tiles.push('mute');
  if (ctx.activePinCount > 0) tiles.push('pins');
  tiles.push('help');

  const archive =
    (adhoc && (ctx.isCreator || ctx.isAdmin)) ||
    (kind === 'pinboard' && (ctx.isPrivileged || ctx.isAdmin)) ||
    (kind === 'other' && ctx.isAdmin);

  return {
    tiles,
    members: MEMBERS[kind],
    canInvite: adhoc,
    canRemoveMembers: adhoc && (ctx.isCreator || ctx.isAdmin),
    hide: !protectedRoom,
    archive,
    archiveViaGroup: kind === 'group' && groupLevel,
    leave: kind === 'dm' || adhoc || kind === 'pinboard' || kind === 'other',
    // 'other' is decided at write time by maySendStateEvent, not here.
    pinForAll: kind === 'dm' || adhoc || ((kind === 'group' || kind === 'pinboard') && groupLevel),
  };
}

/** Room kind: notes beat everything, then support, then direct, then the group kind (`chat` is an ad-hoc chat). */
export function roomKindOf(p: { isDirect: boolean; isNotes: boolean; isSupport: boolean; groupKind?: 'group' | 'chat' | 'pinboard' }): RoomKind {
  if (p.isNotes) return 'notes';
  if (p.isSupport) return 'support';
  if (p.isDirect) return 'dm';
  if (p.groupKind === 'chat') return 'adhoc';
  if (p.groupKind === 'group' || p.groupKind === 'pinboard') return p.groupKind;
  return 'other';
}

/** Localpart of a canonical alias (`#group_x:server` → `group_x`); '' when there is none. */
export function aliasLocalpartOf(alias: string | undefined): string {
  return alias?.startsWith('#') ? alias.slice(1).split(':')[0] : '';
}
