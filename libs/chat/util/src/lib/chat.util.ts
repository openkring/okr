/** Single locale for all chat timestamp rendering (i18n consolidation, design review #5). */
export const CHAT_LOCALE = 'de-DE';

/**
 * Format a Matrix timestamp (ms since epoch) into a compact room-list string.
 * Today → time, yesterday → yesterdayLabel, this week → weekday, older → date.
 * @param yesterdayLabel resolved i18n label for "yesterday" (defaults to German)
 */
export function formatMatrixTimestamp(timestamp: number, yesterdayLabel = 'Gestern'): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return formatMatrixTime(timestamp);
  if (days === 1) return yesterdayLabel;
  if (days < 7) return date.toLocaleDateString(CHAT_LOCALE, { weekday: 'short' });
  return date.toLocaleDateString(CHAT_LOCALE, { month: 'short', day: 'numeric' });
}

/** Format a Matrix timestamp as a day heading: today/yesterday label, else full date. */
export function formatMatrixDate(timestamp: number, todayLabel = 'Heute', yesterdayLabel = 'Gestern'): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return todayLabel;
  if (date.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return date.toLocaleDateString(CHAT_LOCALE, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/** Format a Matrix timestamp as HH:mm. */
export function formatMatrixTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(CHAT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Returns true if the given URL is an HTTP or blob URL (i.e. directly renderable as <img>).
 * mxc:// URIs and icon names return false.
 */
export function isMatrixPhotoUrl(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('http');
}

const RECEIPT_COLORS = ['#e57373','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#ffb74d'];

export function buildReceiptAriaLabel(receipts: Array<{ displayName: string }>): string {
  if (receipts.length === 0) return '';
  if (receipts.length === 1) return `Gelesen von ${receipts[0].displayName}`;
  if (receipts.length === 2) return `Gelesen von ${receipts[0].displayName}, ${receipts[1].displayName}`;
  return `Gelesen von ${receipts[0].displayName}, ${receipts[1].displayName} (+${receipts.length - 2} weitere)`;
}

export function hashUserIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return RECEIPT_COLORS[Math.abs(hash) % RECEIPT_COLORS.length];
}

export function formatReceiptTime(ts: number): string {
  return `Gelesen ${new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

/**
 * Resolve a human-readable name for a Matrix user: the profile display name
 * (provisioned from the person's full name) or, if unset, the localpart of the
 * Matrix user ID — never the full internal `@localpart:server` ID.
 */
export function resolveMatrixDisplayName(rawDisplayName: string | null | undefined, userId: string): string {
  return rawDisplayName || userId.split(':')[0].replace(/^@/, '');
}

/**
 * Custom room state event carrying the okr tenants a room belongs to: `{ tenants: string[] }`.
 * Kept in sync with `OKR_TENANT_EVENT` in `apps/functions/src/matrix-simple/shared.ts`
 * (the Cloud Functions cannot import from libs).
 */
export const OKR_TENANT_EVENT = 'org.okr.tenant';

/**
 * Localpart prefixes used by the mautrix bridge family for their puppet ("ghost") users —
 * `@signal_<uuid>`, `@whatsapp_<number>`, … A ghost is the bridged contact themselves, not an
 * okr person and not a bot, so it must NOT go into SERVICE_ACCOUNT_LOCALPARTS (that set hides
 * an account from member lists, receipts and calls, which would be wrong for a real
 * counterpart). It only tells the tenant filter "this DM's counterpart can never match a
 * person okey, so don't hide the room for failing to".
 */
export const BRIDGE_GHOST_PREFIXES = ['signal_', 'whatsapp_', 'telegram_', 'discord_', 'slack_', 'instagram_', 'messenger_', 'gmessages_', 'twitter_'];

/** True if the Matrix localpart is a bridge puppet rather than an okr person account. */
export function isBridgeGhost(localpart: string): boolean {
  return BRIDGE_GHOST_PREFIXES.some(prefix => localpart.startsWith(prefix));
}

/**
 * Matrix accounts are ONE per person across all tenants (shared homeserver), so the joined-room
 * list mixes every tenant's chats. This keeps only the rooms of the tenant whose app is running.
 *
 * Per room, in order:
 *  1. `tenants` — the `org.okr.tenant` marker written at room creation (and backfilled onto
 *     existing group rooms). Authoritative.
 *  2. no marker, but a `#group_…` canonical alias (mapped onto `topic` by MatrixChatService):
 *     a group room, kept when it matches one of this tenant's groups — by the persisted
 *     `matrixRoomId`, or by the alias localpart derived from the group okey (same derivation as
 *     `groupRoomAliasLocalpart` in the Cloud Functions) for groups whose chat was never opened.
 *  3. a DM (`directUserId`): kept when the counterpart is a person of this tenant. DMs carry no
 *     marker by design — stamping one would mean force-joining the admin bot into a private
 *     two-person conversation — and they need none: a DM belongs where both people are.
 *     A bridged counterpart (`@signal_…` and friends) is not an okr person and can never match,
 *     so it is kept rather than hidden everywhere; DMs with a service/bot account never reach
 *     this rule at all, because MatrixChatService leaves `directUserId` unset for them.
 *  4. anything else (ad-hoc room, unresolvable DM counterpart): kept. Hiding a room we cannot
 *     classify would lose a conversation.
 *
 * `personKeys` are this tenant's person okeys, lowercased — a Matrix localpart IS the person okey.
 */
export function filterRoomsOfTenant<T extends {
  roomId: string; topic?: string; tenants?: string[]; directUserId?: string;
}>(
  rooms: T[],
  groups: { okey: string; matrixRoomId?: string }[],
  personKeys: Set<string>,
  tenantId: string
): T[] {
  const roomIds = new Set(groups.map(g => g.matrixRoomId).filter(Boolean));
  const aliases = new Set(groups.map(g => `#group_${g.okey.toLowerCase().replace(/[^a-z0-9._~-]/g, '_')}`));
  return rooms.filter(r => {
    if (r.tenants?.length) return r.tenants.includes(tenantId);
    // Lowercased: rooms created by an older code path kept the okey's original case
    // (`#group_Trainerteam`), while the alias derived from a group okey is lowercased.
    const alias = r.topic?.toLowerCase();
    if (alias?.startsWith('#group_')) return roomIds.has(r.roomId) || aliases.has(alias.split(':')[0]);
    if (r.directUserId) {
      const localpart = r.directUserId.split(':')[0].replace(/^@/, '').toLowerCase();
      return isBridgeGhost(localpart) || personKeys.has(localpart);
    }
    return true;
  });
}

/**
 * Find the tenant's support room among the user's rooms.
 *
 * Identified by its immutable canonical alias (`MatrixRoom.topic` carries
 * `room.getCanonicalAlias()` in this codebase), so a display-name change cannot break it.
 * Falls back to the display name for rooms that have no alias at all (client-created
 * rooms may lack one).
 */
export function findSupportRoom<T extends { roomId: string; name?: string; topic?: string }>(rooms: T[]): T | undefined {
  const alias = (r: T): string | undefined => r.topic?.startsWith('#') ? r.topic.slice(1).split(':')[0] : undefined;
  // an alias match always wins: a room merely *named* "Support" must not shadow the real one
  return rooms.find(r => { const a = alias(r); return a === 'support' || a === 'group_support'; })
      ?? rooms.find(r => !alias(r) && r.name?.toLowerCase() === 'support');
}
