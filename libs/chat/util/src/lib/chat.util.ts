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

/** One row of the read-receipt popover: who read the message, and how they reacted to it. */
export interface ReceiptRow {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  /** read time — absent for someone who reacted but whose read marker has moved on */
  ts?: number;
  emojis: string[];
}

/**
 * Merge a message's read receipts with its reactions into the popover rows.
 *
 * A receipt marks only a person's LATEST read message, so whoever reacted to this message
 * and then read further has no receipt here. They are appended after the readers (reacting
 * implies having read), resolved through `knownUsers` — the receipts of the whole room, which
 * cover every member with a read marker — and fall back to the Matrix localpart.
 * The current user is skipped on both sides, as the receipts already do.
 */
export function buildReceiptRows(
  receipts: Array<{ userId: string; displayName: string; avatarUrl?: string; ts: number }>,
  reactions: Map<string, Set<string>> | undefined,
  knownUsers: Map<string, { displayName: string; avatarUrl?: string }>,
  currentUserId?: string,
): ReceiptRow[] {
  const emojisByUser = new Map<string, string[]>();
  for (const [emoji, users] of reactions ?? []) {
    for (const userId of users) {
      if (userId === currentUserId) continue;
      emojisByUser.set(userId, [...(emojisByUser.get(userId) ?? []), emoji]);
    }
  }
  const rows: ReceiptRow[] = receipts.map((r) => ({ ...r, emojis: emojisByUser.get(r.userId) ?? [] }));
  const readers = new Set(receipts.map((r) => r.userId));
  for (const [userId, emojis] of emojisByUser) {
    if (readers.has(userId)) continue;
    const known = knownUsers.get(userId);
    rows.push({
      userId,
      displayName: known?.displayName ?? resolveMatrixDisplayName(undefined, userId),
      avatarUrl: known?.avatarUrl,
      emojis,
    });
  }
  return rows;
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
 * Matrix room tag marking a room the user pinned to the top of the room list. `m.favourite` is
 * part of the Matrix spec, so it lives in the user's account data on the homeserver: the pin is
 * personal, survives a reinstall and follows the person to every device — and, because one person
 * has ONE Matrix account across tenants, to every tenant app as well. Nothing is written to
 * Firestore for it.
 */
export const MATRIX_FAVOURITE_TAG = 'm.favourite';

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
 * Localparts of the mautrix bridge BOTS — `@signalbot`, `@whatsappbot`, … — derived from the
 * same prefix list as the ghosts so a newly bridged platform only has to be added once.
 *
 * The bot is not a ghost: it is the bridge's own service account, and it is the CREATOR of
 * every room a bridge provisions. That makes it the cheapest reliable "this room is bridged"
 * signal available to the room list — see `isBridgedRoom`.
 */
export const BRIDGE_BOT_LOCALPARTS = BRIDGE_GHOST_PREFIXES.map(p => `${p.replace(/_$/, '')}bot`);

/** True if the Matrix localpart is a mautrix bridge's own bot account. */
export function isBridgeBot(localpart: string): boolean {
  return BRIDGE_BOT_LOCALPARTS.includes(localpart);
}

/**
 * Matrix `server_name` from the homeserver URL — the domain that appears in user and room ids
 * (`@kaiser:bkchat.etke.host`), which is NOT the same string as the URL: the API is usually
 * served from a `matrix.` subdomain that is no part of the server name.
 */
export function serverNameOf(homeserverUrl: string): string {
  return homeserverUrl.replace(/^https?:\/\//, '').replace(/^matrix\./, '').replace(/\/+$/, '');
}

/**
 * Whether a room lives on a different homeserver than ours.
 *
 * A room id is `!<opaque>:<server that created it>` — the domain is assigned at creation and
 * never changes, even as the room federates. Every okr room is created on our own homeserver
 * (by `resolveGroupRoom`, `createAdhocChat` or MatrixChatService), so a foreign domain is
 * positive proof the room is not one of ours.
 *
 * Returns false without a `serverName` so callers that cannot supply one keep the old
 * behaviour — failing towards "show it", never towards hiding every room at once.
 */
export function isForeignRoom(roomId: string, serverName: string | undefined): boolean {
  if (!serverName) return false;
  const domain = roomId.split(':').slice(1).join(':');
  return !!domain && domain.toLowerCase() !== serverName.toLowerCase();
}

/**
 * Whether a room was provisioned by a chat bridge rather than by okr.
 *
 * Decided on the room's CREATOR, and that choice is forced rather than preferred: the room-list
 * entry deliberately carries `members: []` (perf fix P-2 — rebuilding member arrays for every
 * room on every debounced event was O(rooms × members)), so a membership test would silently
 * always be false. `m.room.create` is already read in the same state lookup that feeds
 * `stateLoaded`, so the creator costs nothing extra and cannot be absent from a room whose
 * state has arrived.
 *
 * Returns false for an absent creator, which is the safe direction: a bridged room shown a beat
 * too long loses nothing, a real conversation hidden does.
 */
export function isBridgedRoom(creator: string | undefined): boolean {
  if (!creator) return false;
  return isBridgeBot(creator.split(':')[0].replace(/^@/, '').toLowerCase());
}

/**
 * Canonical-alias localpart of a group room: `group_<sanitised okey>`.
 *
 * Mirrors `groupRoomAliasLocalpart` in `apps/functions/src/matrix-simple/shared.ts` (libs
 * cannot be imported into the functions build — keep the two in sync). Matrix alias localparts
 * are limited to `[a-z0-9._~-]`, which is exactly why the room's DISPLAY name and its alias are
 * two different strings: the name may read "Kandidat:innen & Instrukt.", the alias may not.
 */
export function groupRoomAliasLocalpart(groupOkey: string): string {
  return `group_${groupOkey.toLowerCase().replace(/[^a-z0-9._~-]/g, '_')}`;
}

/**
 * Canonical-alias localpart of an ask room: `ask_<sanitised group okey>_<sanitised personKey>`.
 *
 * Mirrors `askRoomAliasLocalpart` in `apps/functions/src/matrix-simple/shared.ts` — keep the two
 * in sync. The sanitising matters more than it looks: `groups/'Ausschuss Boote'` is a real
 * pre-2026-08 key, so its rooms carry `#ask_ausschuss_boote_…`. A client that did not sanitise
 * identically would never recognise a room it is already in, and would ask for a new one.
 */
export function askRoomAliasLocalpart(groupOkey: string, personKey: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9._~-]/g, '_');
  return `ask_${clean(groupOkey)}_${clean(personKey)}`;
}

/**
 * Whether opening this group's chat should render the "no conversation yet" state INSTEAD of
 * asking the Cloud Function for a room (spec `2026-08-26-lazy-ask-rooms-spec.md` §1).
 *
 * A `chatMode: 'ask'` group gives every requester their own room and force-joins the whole group
 * into it. Because that happened on OPEN, merely looking at the chat tab put a permanent
 * `<Gruppe> · <Name>` row into every member's room list for a conversation that never happened —
 * 22 of 28 such rooms were empty on 2026-09-18, and six of them were read as incoming "Notfall"
 * messages by people who received nothing.
 *
 * Deferring is deliberately the narrow case. Every uncertainty resolves to `false`, i.e. today's
 * behaviour:
 *
 * - `shared` opens an EXISTING room — nothing is created, and deferring would hide its history.
 * - `members` is refused by the CF for a non-member and shared for a member.
 * - An unknown group (doc not loaded, or another tenant) is never guessed at: the cost of being
 *   wrong here is one empty room, exactly as before this change, rather than a chat that cannot
 *   be opened.
 *
 * The person's OWN room is what ends the deferral — not any room of the group. A member sees
 * every requester's room, so a prefix match would make their first message skip creation and
 * post into a stranger's conversation.
 */
export function shouldDeferAskRoom(
  group: { okey: string; chatMode?: 'shared' | 'ask' | 'members' } | undefined,
  joinedRooms: Array<{ canonicalAlias?: string }>,
  personKey: string,
): boolean {
  if (!group || group.chatMode !== 'ask' || !personKey) return false;
  const own = askRoomAliasLocalpart(group.okey, personKey);
  const hasOwnRoom = joinedRooms.some(
    (r) => r.canonicalAlias?.split(':')[0]?.replace(/^#/, '').toLowerCase() === own,
  );
  return !hasOwnRoom;
}

/**
 * The group okey a room alias points at, or undefined for a non-group alias.
 * `#group_scs_notfall:bkchat.etke.host` → `scs_notfall`.
 *
 * This — never the room name — is how a room is matched back to its group. Room names are
 * free text and carry the group's display name; only the alias is an identifier.
 */
export function groupKeyFromRoomAlias(alias: string | undefined): string | undefined {
  const localpart = alias?.split(':')[0]?.replace(/^#/, '').toLowerCase();
  return localpart?.startsWith('group_') ? localpart.slice('group_'.length) : undefined;
}

/**
 * Matrix accounts are ONE per person across all tenants (shared homeserver), so the joined-room
 * list mixes every tenant's chats. This keeps only the rooms of the tenant whose app is running.
 *
 * Per room, in order:
 *  1. `tenants` — the `org.okr.tenant` marker written at room creation (and backfilled onto
 *     existing group rooms). Authoritative.
 *  1b. marker PRESENT but EMPTY (`tenants: []`): hidden in every tenant. This is the only way
 *     to say "this room belongs to no okr app", and it is a deliberate statement rather than
 *     the absence of one — an unmarked room (rule 5) means "not classified", an empty marker
 *     means "classified as private". Two callers rely on it: a bridged personal chat that was
 *     explicitly unassigned, and a group that was archived (its room keeps its history and
 *     disappears from the app, instead of being purged for a reversible action).
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
 *  4. `stateLoaded === false`: dropped. The room list is emitted during the initial sync, before
 *     room state has arrived, so such an entry has no marker, no alias and no `directUserId` —
 *     not "unclassifiable" but "not classifiable YET". Rule 5 would keep it in every tenant for
 *     the length of that window (an elab group room briefly listed in the scs app). It comes
 *     back a beat later, fully classified, on the next rebuild.
 *  1c. a room hosted on ANOTHER homeserver: dropped. The domain of a room id is the server that
 *     created it, and every okr room is created on ours — so a foreign domain means a room
 *     federated in from elsewhere (the hoster's own `#news:etke.cc` and `#service:etke.cc`,
 *     1069 and 972 members, reached every tenant app through rule 5). Such a room can never be
 *     marked either: `setRoomTenants` needs the admin bot to hold power in the room, and the
 *     Synapse admin API only governs local rooms — so this is the only place it can be handled.
 *     Skipped entirely when no `serverName` is supplied, so a caller that cannot supply one
 *     keeps the previous behaviour rather than hiding everything.
 *  4b. an unmarked, alias-less room CREATED BY A BRIDGE BOT (`@signalbot` and friends): dropped.
 *     A bridge provisions one room per bridged conversation on its own schedule, so these
 *     appear continuously and can never match a group or a person — rule 5 would put every one
 *     of the user's private Signal/WhatsApp groups into every tenant app they open, and a
 *     one-time cleanup would not hold. Default-hidden rather than default-everywhere; assign a
 *     marker (rule 1) to surface one deliberately. A bridged 1:1 chat never reaches here —
 *     rule 3 keeps it, because a DM belongs wherever its two participants are.
 *  5. anything else (ad-hoc room, unresolvable DM counterpart): kept. Hiding a room we cannot
 *     classify would lose a conversation.
 *
 * `personKeys` are this tenant's person okeys, lowercased — a Matrix localpart IS the person okey.
 */
export function filterRoomsOfTenant<T extends {
  roomId: string; topic?: string; tenants?: string[]; directUserId?: string; stateLoaded?: boolean;
  creator?: string;
}>(
  rooms: T[],
  groups: { okey: string; matrixRoomId?: string }[],
  personKeys: Set<string>,
  tenantId: string,
  serverName?: string
): T[] {
  const roomIds = new Set(groups.map(g => g.matrixRoomId).filter(Boolean));
  const aliases = new Set(groups.map(g => `#${groupRoomAliasLocalpart(g.okey)}`));
  return rooms.filter(r => {
    if (r.tenants?.length) return r.tenants.includes(tenantId);
    // An empty marker is a statement, not a gap: the room was explicitly assigned to no
    // tenant. `undefined` (never marked) falls through to the classification rules below.
    if (r.tenants) return false;
    if (isForeignRoom(r.roomId, serverName)) return false;
    // Lowercased: rooms created by an older code path kept the okey's original case
    // (`#group_Trainerteam`), while the alias derived from a group okey is lowercased.
    const alias = r.topic?.toLowerCase();
    if (alias?.startsWith('#group_')) return roomIds.has(r.roomId) || aliases.has(alias.split(':')[0]);
    if (r.directUserId) {
      const localpart = r.directUserId.split(':')[0].replace(/^@/, '').toLowerCase();
      return isBridgeGhost(localpart) || personKeys.has(localpart);
    }
    // Explicit `false` only: undefined means an entry from a code path that does not track
    // state loading, which must keep the historic "keep" behaviour.
    if (r.stateLoaded === false) return false;
    if (isBridgedRoom(r.creator)) return false;
    return true;
  });
}

/**
 * Whether a room can be placed in a tenant YET, i.e. whether `MatrixRoom.stateLoaded` may be
 * reported as `true` for it.
 *
 * `m.room.create` proves the room's STATE arrived. It does not prove that the data DM
 * classification hangs on arrived: `m.direct` is global account data and the counterpart comes
 * from (lazily loaded) member state, both of which land later than the room-state events that
 * already trigger a room-list rebuild during the initial sync.
 *
 * A DM built inside that window therefore carries no marker (DMs never do), no alias, no
 * `m.room.name` and no `directUserId` — and `filterRoomsOfTenant` rule 5 keeps exactly that
 * shape in EVERY tenant. That is the "a 1:1 chat from the other tenant shows for a few seconds
 * after login, then disappears" report: the room is not unclassifiable, it is
 * **not classifiable yet**, and it comes back correctly placed at PREPARED.
 *
 * So before the initial sync completes, a room is only emitted when it identifies itself —
 * marker, alias, name, or a resolved DM counterpart. Afterwards the historic rule applies again,
 * so a genuinely unclassifiable room (an ad-hoc room, a DM whose counterpart never resolves) is
 * still kept rather than lost.
 */
export function isRoomClassifiable(room: {
  hasCreateEvent: boolean;
  syncPrepared: boolean;
  hasTenantMarker: boolean;
  hasAlias: boolean;
  hasRoomName: boolean;
  hasDirectUserId: boolean;
}): boolean {
  if (!room.hasCreateEvent) return false;
  if (room.syncPrepared) return true;
  return room.hasTenantMarker || room.hasAlias || room.hasRoomName || room.hasDirectUserId;
}

/**
 * Find the tenant's support room among the user's rooms.
 *
 * Identified by its immutable canonical alias (`MatrixRoom.topic` carries
 * `room.getCanonicalAlias()` in this codebase), so a display-name change cannot break it.
 * Falls back to the display name for rooms that have no alias at all (client-created
 * rooms may lack one).
 */
export function findSupportRoom<T extends { roomId: string; name?: string; topic?: string }>(rooms: T[], tenantId: string): T | undefined {
  const alias = (r: T): string | undefined => r.topic?.startsWith('#') ? r.topic.slice(1).split(':')[0] : undefined;
  // Group keys are tenant-prefixed since 2026-08 (see getGroupKeyFromName), so this tenant's
  // support group yields `#group_<tenant>_support`. The two unprefixed aliases are the legacy
  // shape and are only reached with an already tenant-filtered room list.
  const own = `group_${tenantId}_support`;
  // an alias match always wins: a room merely *named* "Support" must not shadow the real one
  return rooms.find(r => { const a = alias(r); return a === own || a === 'support' || a === 'group_support'; })
      ?? rooms.find(r => !alias(r) && r.name?.toLowerCase() === 'support');
}

/**
 * Turn a plain-text message body into HTML with clickable http(s) links.
 * Used for `m.text` messages that carry no `formatted_body` (anything sent as plain text,
 * e.g. the schedule-poll invite) — Angular sanitises the result at the `[innerHTML]` site,
 * but the body is escaped here anyway so `<` in a message can never become markup.
 */
export function linkifyText(text: string): string {
  const escaped = text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  return escaped.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)"']/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

/**
 * Whether a timeline event is rendered as a message bubble by `matrix-message-list`.
 *
 * Mirrors the filter in `MatrixChatService.emitMessagesFromTimeline`, and exists as its own
 * predicate because "have we loaded enough history?" must count RENDERABLE events, never raw
 * timeline events: group rooms are dominated by `m.room.member` (the scs Vorstand room holds
 * 59 member events against 23 messages), so a 20-event window can carry a single bubble.
 *
 * @param type the event type (`event.getType()`)
 * @param relatesTo the event content's `m.relates_to`, used to drop edit events — the edit is
 *   applied to the original bubble instead of rendering as one of its own.
 */
export function isRenderableChatEvent(type: string, relatesTo?: { rel_type?: string; event_id?: string }): boolean {
  if (type === 'org.matrix.msc3381.poll.start') return true;
  if (type !== 'm.room.message') return false;
  return !(relatesTo?.rel_type === 'm.replace' && !!relatesTo.event_id);
}

/**
 * Darf die eigene Person in diesem Raum schreiben?
 *
 * Der Client trifft hier KEINE eigene Berechtigungsentscheidung — er bildet nur ab, was
 * Synapse ohnehin durchsetzt (`m.room.power_levels.events_default`). Solange der Raumzustand
 * noch nicht da ist, wird bejaht: ein faelschlich gesperrtes Eingabefeld sieht wie ein
 * Defekt aus, waehrend eine unerlaubte Nachricht serverseitig sauber abgewiesen wuerde.
 */
export function canPostWithPower(ownPower: number | undefined, eventsDefault: number | undefined): boolean {
  if (eventsDefault === undefined) return true;
  return (ownPower ?? 0) >= eventsDefault;
}

/**
 * True when a Matrix request failed because the room is gone for this user — the server
 * says the user is not in it (`M_FORBIDDEN … not in room`) or the room does not exist
 * (`M_NOT_FOUND`).
 *
 * The client can hold such a room in its IndexedDB store although the server has no trace of
 * it: a room deleted + purged through the Synapse admin API (a group room that was re-created)
 * yields no leave event a client that was offline at the time could ever sync, so the room
 * stays "joined" locally forever. Timeline pagination against it is the first request that
 * exposes the mismatch (SCS-AD). Other 403s (missing power level, history visibility) and
 * transport errors are NOT a gone room and must not be treated as one.
 */
export function isRoomGoneError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { errcode, message } = error as { errcode?: string; message?: string };
  if (errcode === 'M_NOT_FOUND') return true;
  return errcode === 'M_FORBIDDEN' && /not in room/i.test(message ?? '');
}

/** The part of a group document this module needs to match a room back to it. */
export interface RoomOwningGroup {
  okey: string;
  matrixRoomId?: string;
}

/**
 * The group (or ad-hoc chat) a Matrix room belongs to, or undefined for a DM or an
 * unmatched room.
 *
 * Two keys, in the order `resolveGroupRoom` trusts them: the stored `matrixRoomId` is
 * authoritative, the canonical alias is the fallback for a group whose id was never written
 * back. The room NAME is deliberately not consulted — it carries the group's free-text
 * display name and is no identifier.
 *
 * `groups` must come from `AppStore.allGroupsAndChats()`: `allGroups()` drops the ad-hoc
 * chats, and a room resolving to "no group" is exactly what the ad-hoc callers need to see.
 */
export function findGroupOfRoom<T extends RoomOwningGroup>(
  groups: T[],
  roomId: string,
  canonicalAlias: string | undefined,
): T | undefined {
  const aliasKey = groupKeyFromRoomAlias(canonicalAlias);
  return groups.find(g =>
    (!!g.matrixRoomId && g.matrixRoomId === roomId) ||
    (!!aliasKey && groupRoomAliasLocalpart(g.okey) === `group_${aliasKey}`)
  );
}
