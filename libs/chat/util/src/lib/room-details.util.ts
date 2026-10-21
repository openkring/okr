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
  /** Kiosk-only user on a shared device: no membership or visibility changes, no mute (Ruling R10). */
  isKiosk: boolean;
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
  if (kind !== 'support' && !ctx.isKiosk) tiles.push('mute');
  if (ctx.activePinCount > 0) tiles.push('pins');
  tiles.push('help');

  const archive =
    (adhoc && (ctx.isCreator || ctx.isAdmin)) ||
    (kind === 'pinboard' && (ctx.isPrivileged || ctx.isAdmin)) ||
    (kind === 'other' && ctx.isAdmin);

  if (ctx.isKiosk) {
    return {
      tiles,
      members: MEMBERS[kind],
      canInvite: false,
      canRemoveMembers: false,
      hide: false,
      archive: false,
      archiveViaGroup: false,
      leave: false,
      pinForAll: false,
    };
  }

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
    // DMs: the room right only. The client additionally gates DMs on the actual power to write
    // `m.room.pinned_events` (`canPinForAll` in pins.feature.ts), like 'other' rooms.
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

/**
 * Tenant marker of an 'other' room after «Chat archivieren» in tenant `tenantId` (spec 1.109
 * §10.2, ruling R12): only this tenant is removed, so the room stays in the other apps; `[]` only
 * when this tenant was the only one. Undefined when the marker is unreadable (room not loaded, no
 * marker = unclassified, malformed content): the caller must refuse — never fall back to `[]`,
 * which would take the room out of every app.
 */
export function tenantsAfterArchive(markerTenants: unknown, tenantId: string): string[] | undefined {
  if (!Array.isArray(markerTenants) || !markerTenants.every((t) => typeof t === 'string')) return undefined;
  return (markerTenants as string[]).filter((t) => t !== tenantId);
}
