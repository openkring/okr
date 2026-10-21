/**
 * Mute and hide (spec 1.109 §9, §10.1). The mute lives in global account data `org.okr.mute`;
 * `all` is keyed by tenant so muting one app never silences another. Time is always a parameter.
 */

/** Global account data type of the mute content. */
export const OKR_MUTE_EVENT = 'org.okr.mute';

/** Room tag that hides a room from the list. */
export const OKR_HIDDEN_TAG = 'org.okr.hidden';

/** `until` is an expiry in ms, `null` = until switched off. `byHide` marks a mute made by hiding the room. */
export interface MuteEntry {
  until: number | null;
  byHide?: true;
  /** A user-set mute that hiding replaced; restored on unhide while still active. */
  prevUntil?: number | null;
}

export interface MuteContent {
  all: Record<string, number | null>;
  rooms: Record<string, MuteEntry>;
}

export type MuteDuration = '1h' | '8h' | '1w' | 'forever';

export const MUTE_DURATIONS: readonly MuteDuration[] = ['1h', '8h', '1w', 'forever'];

const HOUR_MS = 3_600_000;
const DURATION_MS: Record<Exclude<MuteDuration, 'forever'>, number> = {
  '1h': HOUR_MS,
  '8h': 8 * HOUR_MS,
  '1w': 7 * 24 * HOUR_MS,
};

export function muteUntil(d: MuteDuration, now: number): number | null {
  return d === 'forever' ? null : now + DURATION_MS[d];
}

function isUntil(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tolerant parse of the account data content: malformed entries are dropped. */
export function parseMuteContent(raw: Record<string, unknown> | undefined): MuteContent {
  const all: Record<string, number | null> = {};
  const rooms: Record<string, MuteEntry> = {};
  const rawAll = raw?.['all'];
  if (isRecord(rawAll)) {
    for (const [tenant, until] of Object.entries(rawAll)) if (isUntil(until)) all[tenant] = until;
  }
  const rawRooms = raw?.['rooms'];
  if (isRecord(rawRooms)) {
    for (const [roomId, entry] of Object.entries(rawRooms)) {
      if (!isRecord(entry) || !isUntil(entry['until'])) continue;
      if (entry['byHide'] !== true) {
        rooms[roomId] = { until: entry['until'] };
      } else if (isUntil(entry['prevUntil']) && entry['prevUntil'] !== undefined) {
        rooms[roomId] = { until: entry['until'], byHide: true, prevUntil: entry['prevUntil'] };
      } else {
        rooms[roomId] = { until: entry['until'], byHide: true };
      }
    }
  }
  return { all, rooms };
}

function active(until: number | null | undefined, now: number): boolean {
  return until === null || (until !== undefined && until > now);
}

/** Protected rooms (support, Notfall) are never muted, whatever the content says. */
export function isRoomMuted(c: MuteContent, roomId: string, tenantId: string, now: number, isProtected: boolean): boolean {
  if (isProtected) return false;
  const entry = c.rooms[roomId];
  return (entry !== undefined && active(entry.until, now)) || isAllMuted(c, tenantId, now);
}

/** Whether everything of this tenant is muted. */
export function isAllMuted(c: MuteContent, tenantId: string, now: number): boolean {
  return active(c.all[tenantId], now);
}

function pruned(c: MuteContent, now: number): MuteContent {
  const all: Record<string, number | null> = {};
  for (const [tenant, until] of Object.entries(c.all)) if (active(until, now)) all[tenant] = until;
  const rooms: Record<string, MuteEntry> = {};
  for (const [roomId, entry] of Object.entries(c.rooms)) if (active(entry.until, now)) rooms[roomId] = entry;
  return { all, rooms };
}

export function withRoomMute(c: MuteContent, roomId: string, until: number | null, now: number, byHide?: boolean): MuteContent {
  const next = pruned(c, now);
  const existing = next.rooms[roomId];
  if (!byHide) next.rooms[roomId] = { until };
  else if (existing && !existing.byHide) next.rooms[roomId] = { until, byHide: true, prevUntil: existing.until };
  else if (existing?.byHide && existing.prevUntil !== undefined) next.rooms[roomId] = { until, byHide: true, prevUntil: existing.prevUntil };
  else next.rooms[roomId] = { until, byHide: true };
  return next;
}

/** Removes a room mute; with `onlyByHide` only one that was made by hiding (a user-set mute survives unhide). */
export function withoutRoomMute(c: MuteContent, roomId: string, now: number, onlyByHide?: boolean): MuteContent {
  const next = pruned(c, now);
  const entry = next.rooms[roomId];
  if (!entry || (onlyByHide && !entry.byHide)) return next;
  if (entry.byHide && entry.prevUntil !== undefined && active(entry.prevUntil, now)) {
    next.rooms[roomId] = { until: entry.prevUntil };
  } else {
    delete next.rooms[roomId];
  }
  return next;
}

/** Sets the tenant-wide mute; `undefined` clears it. */
export function withAllMute(c: MuteContent, tenantId: string, until: number | null | undefined, now: number): MuteContent {
  const next = pruned(c, now);
  if (until === undefined) delete next.all[tenantId];
  else if (active(until, now)) next.all[tenantId] = until;
  else delete next.all[tenantId];
  return next;
}

/** Support and Notfall rooms (alias localpart) can neither be muted nor hidden. */
export function isProtectedRoomAlias(aliasLocalpart: string, tenantId: string): boolean {
  return [`group_${tenantId}_support`, 'support', 'group_support', `group_${tenantId}_notfall`, 'notfall'].includes(aliasLocalpart);
}
