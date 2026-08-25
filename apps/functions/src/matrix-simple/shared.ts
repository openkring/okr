// apps/functions/src/matrix-simple/shared.ts
//
// Shared configuration, authorization gates, and Synapse admin/client helpers
// for all matrix-simple modules (credentials, rooms, push, membership-sync).

import { HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';

import { DateFormat, getTodayStr, isActiveMembership, objectsToPhotos } from '@okr/shared-util-core';

export const matrixAdminToken = defineSecret('MATRIX_ADMIN_TOKEN');
// Shared secret embedded in the Matrix push-gateway URL (SEC-2). Synapse stores the
// secret-bearing URL via registerMatrixPusher and POSTs to it; matrixPushGateway rejects
// any call that does not carry this secret as a path segment. Never sent to the client.
export const pushGatewaySecret = defineSecret('MATRIX_PUSH_GATEWAY_SECRET');
export const MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER || 'https://matrix.bkchat.etke.host';

/** App id used for the HTTP pusher; must match the value matrixPushGateway accepts. */
export const PUSH_APP_ID = 'bkaiser.scs.chat';
/**
 * Origin that serves the push-gateway endpoint. Synapse requires the pusher URL path to be
 * EXACTLY `/_matrix/push/v1/notify`, which the bare `cloudfunctions.net/matrixPushGateway`
 * path cannot satisfy — so the gateway is exposed through a Firebase Hosting rewrite
 * (`/_matrix/push/v1/notify` -> matrixPushGateway) on this origin, and the shared secret
 * travels as a query parameter (ignored by Synapse's path check).
 */
export const PUSH_GATEWAY_BASE = process.env.MATRIX_PUSH_GATEWAY_BASE || 'https://scs-app-54aef.web.app';

/**
 * Resolve the Matrix user localpart for a Firebase UID, requiring a provisioned
 * user. The localpart is Person.okey (via users/{uid}.personKey), which is the
 * single consistent identity across all chat scenarios (group chat, direct chat,
 * chat overview).
 *
 * SEC-3: this is the provisioning gate. It throws (never falls back to the raw
 * Firebase UID) when the user has no `users/{uid}` doc or no `personKey`. The old
 * UID fallback was a second avenue for duplicate `@<uid>` accounts (S1) — a
 * caller without a personKey must be fixed in provisioning, not given a stray
 * Matrix account.
 */
export async function requireUserPersonKey(firebaseUid: string, fnName: string): Promise<string> {
  const doc = await getFirestore().collection('users').doc(firebaseUid).get();
  if (!doc.exists) {
    console.error(`${fnName}: uid ${firebaseUid} has no user profile`);
    throw new HttpsError('permission-denied', 'No user profile.');
  }
  const personKey = doc.data()?.personKey as string | undefined;
  if (!personKey) {
    console.error(`${fnName}: uid ${firebaseUid} has no personKey on its user profile`);
    throw new HttpsError('failed-precondition', 'User profile has no linked person.');
  }
  return personKey;
}

/**
 * Like {@link requireUserPersonKey} but returns the value lowercased, ready to use as
 * the Matrix localpart. NOTE: Matrix localparts are lowercased, but Firestore doc IDs
 * are case-sensitive — do NOT use the return value to look up `persons/{personKey}`;
 * use {@link requireUserPersonKey} (the raw key) for that.
 */
export async function requireMatrixLocalpart(firebaseUid: string, fnName: string): Promise<string> {
  return (await requireUserPersonKey(firebaseUid, fnName)).toLowerCase();
}

/**
 * Resolve a Matrix display name ("Firstname Lastname") from `persons/{personKey}`.
 * The `personKey` must be the raw (case-sensitive) Firestore doc id, not the lowercased
 * Matrix localpart. Returns undefined when the person doc is missing or has no name.
 */
export async function resolvePersonDisplayName(personKey: string): Promise<string | undefined> {
  try {
    const d = (await getFirestore().collection('persons').doc(personKey).get()).data();
    const full = [d?.['firstName'], d?.['lastName']].filter(Boolean).join(' ').trim();
    return full || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Set a Matrix user's display name via the Synapse admin API (idempotent).
 * Best-effort by default: on failure it logs and returns false rather than throwing,
 * so a display-name sync never breaks the surrounding flow (e.g. token exchange).
 */
export async function setMatrixDisplayName(
  matrixUserId: string,
  displayName: string,
  adminToken: string,
): Promise<boolean> {
  const resp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayname: displayName }),
    }
  );
  if (!resp.ok) {
    console.warn(`setMatrixDisplayName: failed for ${matrixUserId} → ${resp.status}: ${await resp.text()}`);
    return false;
  }
  return true;
}

/**
 * imgix CDN host that serves avatar images from Firebase Storage. Same base the app
 * (`env.services.imgixBaseUrl`) and the vCard export use — kept as a constant here
 * because Cloud Functions don't load the per-tenant client environment.
 */
const AVATAR_IMGIX_BASE = process.env.MATRIX_AVATAR_IMGIX_BASE || 'https://bkaiser.imgix.net';

/**
 * Build the public avatar URL for an avatar `storagePath`. The resulting https URL
 * renders directly in the app's Matrix client (its `getAvatarUrl` calls
 * `mxcUrlToHttp(..., allowDirectLinks=true)`), which is why we can store an https
 * URL in Matrix's `avatar_url` instead of uploading to the Synapse media repo.
 */
export function personAvatarUrl(storagePath: string): string {
  return `${AVATAR_IMGIX_BASE}/${storagePath}?fm=jpg&w=256&h=256&fit=crop&crop=faces&auto=compress`;
}

/**
 * Resolve a person's avatar URL from the `avatars` collection. The `personKey` must be the
 * raw (case-sensitive) Firestore doc id. Returns undefined when the person has no avatar
 * doc or the doc carries no `storagePath`.
 *
 * Avatar doc ids come in two shapes (see avatar.util.avatarDocId): the bare `person.<key>`
 * is the shared default, `<tenant>.person.<key>` is one tenant's own picture. Matrix is a
 * single homeserver with ONE identity per person, so the shared default wins here and the
 * caller's tenant avatars are only a fallback — a per-tenant picture is a presentation
 * choice inside that app, not the person's global identity.
 *
 * @param personKey the person's Firestore doc id
 * @param tenantIds the caller's tenants, used only as a fallback source
 */
export async function resolvePersonAvatarUrl(personKey: string, tenantIds: string[] = []): Promise<string | undefined> {
  try {
    if (await objectsToPhotoPublication(personKey)) return undefined;
    const db = getFirestore();
    const ids = [`person.${personKey}`, ...tenantIds.map(tenantId => `${tenantId}.person.${personKey}`)];
    const snaps = await db.getAll(...ids.map(id => db.collection('avatars').doc(id)));
    for (const snap of snaps) {
      const storagePath = snap.data()?.['storagePath'] as string | undefined;
      if (storagePath) return personAvatarUrl(storagePath);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** The caller's tenants from users/{uid}; empty when the doc is missing. */
export async function getUserTenants(uid: string): Promise<string[]> {
  try {
    const doc = await getFirestore().collection('users').doc(uid).get();
    return (doc.data()?.['tenants'] ?? []) as string[];
  } catch {
    return [];
  }
}

/**
 * Honour the photo declaration (`persons.usageImages`, spec 1.19 D-P4-10) before copying a
 * member's picture into the Matrix homeserver.
 *
 * The declaration is organisational, not a rule — but this is one of the few places where the
 * code can honour it at no cost, and it is the place where it matters most: pushing the avatar
 * to Synapse (etke.cc) copies the picture into a **second system**, with its own rooms, its own
 * media repo and its own retention, without the member ever asking for it.
 *
 * Only `Protected` (2) skips: that tier is the outright objection to publication. `Restricted`
 * (1) means "inside the club, yes; published, no", and the members-only chat is inside the club.
 * A missing value is `Public` — legacy person documents carry no `usageImages`, and someone who
 * never expressed anything has not objected.
 */
async function objectsToPhotoPublication(personKey: string): Promise<boolean> {
  try {
    const person = (await getFirestore().collection('persons').doc(personKey).get()).data();
    return objectsToPhotos(person?.['usageImages']);
  } catch {
    return false;   // never let a failed lookup block the ordinary avatar sync
  }
}

/**
 * Set a Matrix user's avatar_url via the Synapse admin API (idempotent).
 * Best-effort by default: on failure it logs and returns false rather than throwing,
 * so an avatar sync never breaks the surrounding flow (e.g. token exchange).
 */
export async function setMatrixAvatarUrl(
  matrixUserId: string,
  avatarUrl: string,
  adminToken: string,
): Promise<boolean> {
  const resp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    }
  );
  if (!resp.ok) {
    console.warn(`setMatrixAvatarUrl: failed for ${matrixUserId} → ${resp.status}: ${await resp.text()}`);
    return false;
  }
  return true;
}

/**
 * Download an image from `imageUrl` and upload it to the Synapse media repo, returning
 * the resulting `mxc://` content URI. Used to convert an app-hosted imgix avatar into a
 * spec-compliant Matrix `avatar_url` that Element and bridges can render (a plain https
 * `avatar_url` renders only in our own client, which opts into mxcUrlToHttp allowDirectLinks).
 *
 * `token` must be a Matrix *access token* (the admin user's token works — it has
 * media-upload capability). Throws on any non-OK response so callers can decide whether
 * to swallow the error (best-effort avatar sync) or surface it.
 */
export async function uploadUrlToMatrixMedia(imageUrl: string, token: string): Promise<string> {
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`uploadUrlToMatrixMedia: source fetch failed ${imgResp.status}`);
  const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
  const bytes = Buffer.from(await imgResp.arrayBuffer());

  const uploadResp = await fetch(
    `${MATRIX_HOMESERVER}/_matrix/media/v3/upload?filename=avatar.jpg`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body: bytes,
    }
  );
  if (!uploadResp.ok) {
    throw new Error(`uploadUrlToMatrixMedia: upload failed ${uploadResp.status}: ${await uploadResp.text()}`);
  }
  const { content_uri } = await uploadResp.json() as { content_uri: string };
  if (!content_uri?.startsWith('mxc://')) {
    throw new Error(`uploadUrlToMatrixMedia: unexpected content_uri "${content_uri}"`);
  }
  return content_uri;
}

/**
 * Resolve a person's avatar as an `mxc://` URI: look up the imgix URL from
 * `avatars/person.<personKey>` (via {@link resolvePersonAvatarUrl}) and upload it to the
 * Synapse media repo. Returns undefined when the person has no avatar. May throw on upload
 * failure; callers wrap it so avatar sync never breaks the surrounding flow.
 */
export async function resolvePersonAvatarMxc(personKey: string, token: string, tenantIds: string[] = []): Promise<string | undefined> {
  const httpUrl = await resolvePersonAvatarUrl(personKey, tenantIds);
  if (!httpUrl) return undefined;
  return uploadUrlToMatrixMedia(httpUrl, token);
}

/**
 * Load the caller's roles map from users/{uid}. Empty object if the doc is missing.
 * Authorization in this project is derived from the user document's `roles` map
 * (the same model the client and Firestore rules use) — NOT from Firebase Auth
 * custom claims, which are never minted anywhere in this codebase.
 */
export async function getCallerRoles(uid: string): Promise<Record<string, boolean>> {
  try {
    const doc = await getFirestore().collection('users').doc(uid).get();
    return (doc.data()?.roles ?? {}) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Throw unless the authenticated caller holds at least one of `allowedRoles`. Returns the uid. */
export async function requireRole(
  request: { auth?: { uid?: string } },
  fnName: string,
  allowedRoles: string[],
): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
  const roles = await getCallerRoles(uid);
  if (!allowedRoles.some((r) => roles[r] === true)) {
    console.error(`${fnName}: uid ${uid} lacks required role(s): ${allowedRoles.join(', ')}`);
    throw new HttpsError('permission-denied', `Requires one of roles: ${allowedRoles.join(', ')}.`);
  }
  return uid;
}

/** Throw unless the caller is a provisioned app user (has a users/{uid} doc). Returns the uid. */
export async function requireProvisionedUser(
  request: { auth?: { uid?: string } },
  fnName: string,
): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
  const doc = await getFirestore().collection('users').doc(uid).get();
  if (!doc.exists) {
    console.error(`${fnName}: uid ${uid} has no user profile`);
    throw new HttpsError('permission-denied', 'No user profile.');
  }
  return uid;
}

/**
 * Validate a required string parameter of a callable (C-hygiene, design review #6).
 * Throws HttpsError('invalid-argument') when missing, not a string, empty, or
 * unreasonably long (these values end up interpolated into Matrix ids/URLs).
 */
export function requireParam(value: unknown, name: string, maxLen = 512): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpsError('invalid-argument', `${name} is required`);
  }
  if (value.length > maxLen) {
    throw new HttpsError('invalid-argument', `${name} exceeds maximum length of ${maxLen}`);
  }
  return value;
}

/**
 * Basic per-uid, per-function rate limiting (design review #6). In-memory sliding
 * window — per Cloud Functions instance, reset on cold start. This is a burst brake
 * against runaway clients and scripted abuse behind a valid App Check token, not a
 * distributed quota (which would need a Firestore/Redis backend).
 */
const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(uid: string, fnName: string, max: number, windowMs = 60_000): void {
  const now = Date.now();
  const key = `${fnName}:${uid}`;
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    console.warn(`${fnName}: rate limit exceeded for uid ${uid} (${hits.length}/${max} per ${windowMs}ms)`);
    throw new HttpsError('resource-exhausted', 'Too many requests — please retry later.');
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  // Opportunistic pruning so the map does not grow unboundedly on long-lived instances.
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t >= windowMs)) rateBuckets.delete(k);
    }
  }
}

/**
 * Single source of truth for a group's Matrix room alias localpart.
 * Matrix alias localparts may only contain [a-z0-9._~-]; the group okey may contain
 * uppercase/spaces/other characters, so it is lowercased and sanitised. ALL CFs must
 * derive the alias through this helper — divergent derivation was a cause of S5
 * duplicate rooms (some CFs used the raw `#group_<okey>`).
 */
export function groupRoomAliasLocalpart(groupId: string): string {
  return `group_${groupId.toLowerCase().replace(/[^a-z0-9._~-]/g, '_')}`;
}

/**
 * Alias localpart of an "ask room": the private room between ONE person and a whole
 * group, used by groups with `chatMode: 'ask'` (Notfall, Support, Vorstand, …).
 * One room per (group, person), reused for every later conversation — so the alias is
 * the room's identity and nothing has to be persisted on the group doc.
 * Same sanitising rule as `groupRoomAliasLocalpart` (Matrix alias localparts are
 * limited to [a-z0-9._~-]).
 */
export function askRoomAliasLocalpart(groupId: string, personKey: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9._~-]/g, '_');
  return `ask_${clean(groupId)}_${clean(personKey)}`;
}

/** personKeys with an active (not archived, not expired) membership in the given group. */
export async function activeGroupMemberKeys(groupId: string): Promise<string[]> {
  const snap = await getFirestore()
    .collection('memberships')
    .where('orgKey', '==', groupId)
    .where('orgModelType', '==', 'group')
    .where('memberModelType', '==', 'person')
    .get();
  const today = getTodayStr(DateFormat.StoreDate);
  return snap.docs
    .map((d) => d.data() as { memberKey: string; dateOfExit?: string; isArchived?: boolean })
    .filter((m) => isActiveMembership(m, today))
    .map((m) => m.memberKey);
}

/**
 * Resolve (or create) the ask room between `personKey` and the group — the room a
 * non-member gets instead of the shared group room when `group.chatMode === 'ask'`.
 *
 * Identified solely by its canonical alias (see `askRoomAliasLocalpart`); there is no
 * per-person field on the group doc to persist a room id into. On creation the whole
 * group is force-joined, so notification and read scope is exactly "the group + this
 * one person" — Matrix does that for us, no push-side filtering needed.
 *
 * ponytail: members who join the group LATER are not back-joined into existing ask
 * rooms — they see new requesters only. Add a reconcile pass over
 * `_synapse/admin/v1/rooms?search_term=ask_<groupId>_` if that starts to bite.
 */
export async function resolveAskRoom(
  groupId: string,
  personKey: string,
  hostname: string,
  adminToken: string,
  opts: { create?: boolean } = {},
): Promise<string | undefined> {
  const authHeader = { Authorization: `Bearer ${adminToken}` };
  const localpart = askRoomAliasLocalpart(groupId, personKey);
  const alias = `#${localpart}:${hostname}`;

  try {
    const aliasResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
      { headers: authHeader }
    );
    if (aliasResp.ok) return (await aliasResp.json() as { room_id: string }).room_id;
  } catch { /* fall through to create */ }

  if (!opts.create) return undefined;

  const groupSnap = await getFirestore().collection('groups').doc(groupId).get();
  if (!groupSnap.exists) throw new HttpsError('not-found', `Group ${groupId} not found`);
  const groupName = (groupSnap.data()?.['name'] as string | undefined) || groupId;
  const personName = (await resolvePersonDisplayName(personKey)) ?? personKey;

  const createResp = await fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/createRoom`,
    {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${groupName} · ${personName}`,
        room_alias_name: localpart,
        preset: 'private_chat',
        visibility: 'private',
        creation_content: { 'm.federate': false },
        initial_state: [
          { type: OKR_TENANT_EVENT, state_key: '', content: { tenants: groupSnap.data()?.['tenants'] ?? [] } },
        ],
      }),
    }
  );
  if (!createResp.ok) {
    throw new HttpsError('internal', `Failed to create ask room for group ${groupId}: ${await createResp.text()}`);
  }
  const roomId = (await createResp.json() as { room_id: string }).room_id;

  await ensureAdminInRoom(roomId, adminToken);
  for (const memberKey of await activeGroupMemberKeys(groupId)) {
    const memberId = `@${memberKey.toLowerCase()}:${hostname}`;
    try {
      await ensureMatrixUserExists(memberId, adminToken, { personKey: memberKey });
      await forceJoinUserToRoom(roomId, memberId, adminToken);
    } catch (error) {
      // One unreachable member must not stop the requester from getting their room.
      console.error(`resolveAskRoom: failed to join ${memberId} into ${roomId}:`, error);
    }
  }
  console.log(`resolveAskRoom: created ${roomId} (${alias}) for group ${groupId}`);
  return roomId;
}

/**
 * Ensure a Matrix account exists for `matrixUserId`, provisioning it via the Synapse
 * admin API if missing. The display name is resolved from `persons/{personKey}` when a
 * personKey is given, else from the Firebase user record when a firebaseUid is given.
 */
export async function ensureMatrixUserExists(
  matrixUserId: string,
  adminToken: string,
  opts: { personKey?: string; firebaseUid?: string } = {},
): Promise<void> {
  const checkResp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  if (checkResp.ok) return;

  let displayName = opts.personKey ?? matrixUserId.split(':')[0].substring(1);
  if (opts.personKey) {
    try {
      const d = (await getFirestore().collection('persons').doc(opts.personKey).get()).data();
      const full = [d?.['firstName'], d?.['lastName']].filter(Boolean).join(' ');
      if (full) displayName = full;
    } catch { /* fallback to personKey */ }
  } else if (opts.firebaseUid) {
    try {
      const u = await getAuth().getUser(opts.firebaseUid);
      displayName = u.displayName || u.email?.split('@')[0] || opts.firebaseUid;
    } catch { /* fallback to localpart */ }
  }

  const createResp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayname: displayName, admin: false, deactivated: false }),
    }
  );
  if (!createResp.ok) {
    throw new HttpsError('internal', `Failed to provision Matrix user ${matrixUserId}: ${await createResp.text()}`);
  }
  console.log(`ensureMatrixUserExists: provisioned ${matrixUserId} (${displayName})`);
}

/**
 * Resolve the Matrix room for a group, in order of trust:
 *   1. `groups/{groupId}.matrixRoomId` (verified to still exist on the homeserver)
 *   2. canonical alias `#group_<sanitised-id>`
 *   3. Synapse admin name-search for a room named exactly `groupId`
 *   4. create a new invite-only room (only when `opts.create` is true)
 *
 * On any successful resolve/create the room ID is persisted back to the group doc, so
 * every CF converges on one room and subsequent lookups are O(1). This is the durable
 * fix for S5 (duplicate group rooms from divergent alias/name lookups).
 *
 * Returns undefined when the room cannot be found and `opts.create` is false.
 */
export async function resolveGroupRoom(
  groupId: string,
  hostname: string,
  adminToken: string,
  opts: { create?: boolean } = {},
): Promise<string | undefined> {
  const authHeader = { Authorization: `Bearer ${adminToken}` };
  const groupRef = getFirestore().collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists && opts.create) {
    throw new HttpsError('not-found', `Group ${groupId} not found`);
  }
  const stored = groupSnap.data()?.['matrixRoomId'] as string | undefined;

  // 1. Stored room id — verify it still exists (a purged room must not be returned)
  if (stored) {
    const checkResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(stored)}`,
      { headers: authHeader }
    );
    if (checkResp.ok) return stored;
    console.warn(`resolveGroupRoom: stored matrixRoomId ${stored} for group ${groupId} no longer exists, re-resolving`);
  }

  let roomId: string | undefined;

  // 2. Canonical alias
  const alias = `#${groupRoomAliasLocalpart(groupId)}:${hostname}`;
  try {
    const aliasResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
      { headers: authHeader }
    );
    if (aliasResp.ok) roomId = (await aliasResp.json() as { room_id: string }).room_id;
  } catch { /* fall through to name search */ }

  // 3. Name search by groupId
  if (!roomId) {
    const searchResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(groupId)}&limit=20`,
      { headers: authHeader }
    );
    if (searchResp.ok) {
      const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };
      const match = data.rooms?.find(r => r.name === groupId);
      if (match) roomId = match.room_id;
    }
  }

  // 4. Create
  if (!roomId && opts.create) {
    const createResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/createRoom`,
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupId,
          room_alias_name: groupRoomAliasLocalpart(groupId),
          // invite-only (SEC-1): admin force-join works without a public join_rule.
          preset: 'private_chat',
          visibility: 'private',
          creation_content: { 'm.federate': false },
          // Tenant marker (see OKR_TENANT_EVENT): the group's tenants become the room's.
          initial_state: [
            { type: OKR_TENANT_EVENT, state_key: '', content: { tenants: groupSnap.data()?.['tenants'] ?? [] } },
          ],
        }),
      }
    );
    if (!createResp.ok) {
      throw new HttpsError('internal', `Failed to create room for group ${groupId}: ${await createResp.text()}`);
    }
    roomId = (await createResp.json() as { room_id: string }).room_id;
    console.log(`resolveGroupRoom: created room ${roomId} for group ${groupId}`);
  }

  // Persist back so all CFs agree and future lookups are O(1)
  if (roomId && roomId !== stored && groupSnap.exists) {
    await groupRef.update({ matrixRoomId: roomId }).catch(err =>
      console.warn(`resolveGroupRoom: failed to persist matrixRoomId for group ${groupId}:`, err)
    );
  }

  return roomId;
}

/**
 * Which room does this person get in this group?
 *
 * Members always share the group room — an 'ask' group is open to everyone, not private to
 * everyone. Only a NON-member of an ask group gets their own room with the whole group.
 * Pure on purpose: the decision is the part worth testing, the fetching is not.
 */
export function useAskRoom(chatMode: string | undefined, memberKeys: string[], personKey: string): boolean {
  if (chatMode !== 'ask') return false;
  const localpart = personKey.toLowerCase();
  return !memberKeys.some((k) => k.toLowerCase() === localpart);
}

/**
 * The room a person reaches a group through — the single source of this decision.
 *
 * Both callers (the `requestGroupRoomAccess` callable and the workflow outbox) MUST go through
 * here: two copies of this branch drifting apart is what produced duplicate rooms once (S5).
 *
 * A group admin without a formal membership counts as a member here too — otherwise an admin
 * who opens their own 'ask' group's chat would get pulled into a personal ask-room instead of
 * landing where every other admin/member does.
 */
export async function resolveChatRoomForPerson(
  groupId: string,
  personKey: string,
  hostname: string,
  adminToken: string,
  opts: { create?: boolean } = {},
): Promise<string | undefined> {
  const groupData = (await getFirestore().collection('groups').doc(groupId).get()).data();
  const memberKeys = await activeGroupMemberKeys(groupId);
  const adminKeys = ((groupData?.['admins'] ?? []) as Array<{ key?: string }>)
    .map((a) => a.key)
    .filter((k): k is string => !!k);
  const ask = useAskRoom(groupData?.['chatMode'] as string | undefined, [...memberKeys, ...adminKeys], personKey);
  return ask
    ? resolveAskRoom(groupId, personKey, hostname, adminToken, opts)
    : resolveGroupRoom(groupId, hostname, adminToken, opts);
}

/**
 * Custom room state event carrying the okr tenants a room belongs to: `{ tenants: string[] }`.
 * One Matrix account serves a person in EVERY tenant, so without this marker the joined-room
 * list of the scs app and the p13 app are identical. Kept in sync with `OKR_TENANT_EVENT` in
 * `@okr/chat-util` (libs cannot be imported here).
 */
export const OKR_TENANT_EVENT = 'org.okr.tenant';

/**
 * Stamp a room with the tenants it belongs to. Best-effort: a failure only means the room
 * stays unmarked, and unmarked rooms remain visible in every tenant (never hidden).
 */
export async function setRoomTenants(roomId: string, tenants: string[], adminToken: string): Promise<boolean> {
  if (!tenants.length) return false;
  await ensureAdminInRoom(roomId, adminToken);

  const put = () => fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${OKR_TENANT_EVENT}/`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenants }),
    }
  );

  let resp = await put();
  if (resp.status === 403) {
    // The admin had to join this room just now, and the membership is not visible to the
    // very next request yet — the write then 403s even though the join succeeded. Observed
    // on 8 group rooms in the first backfill run: they stayed unmarked and reappeared as
    // "to assign" on the next scan, while a second run wrote them without complaint.
    // One short retry turns that two-run dance into one.
    const firstErr = await resp.text();
    await new Promise(resolve => setTimeout(resolve, 1000));
    resp = await put();
    if (!resp.ok) {
      console.warn(`setRoomTenants: ${roomId} → 403 (${firstErr}); retry → ${resp.status}: ${await resp.text()}`);
      return false;
    }
    console.log(`setRoomTenants: ${roomId} written on retry after join`);
  } else if (!resp.ok) {
    console.warn(`setRoomTenants: failed for ${roomId} → ${resp.status}: ${await resp.text()}`);
    return false;
  }
  return true;
}

/** Read the tenants marker of a room; empty array when the room is unmarked. */
export async function getRoomTenants(roomId: string, adminToken: string): Promise<string[]> {
  const resp = await fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${OKR_TENANT_EVENT}/`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  if (!resp.ok) return [];
  const content = await resp.json() as { tenants?: string[] };
  return content.tenants ?? [];
}

/**
 * Whether a room's `org.okr.tenant` marker admits a caller holding `callerTenants`.
 *
 * Pure, so the policy is unit-testable. Two rules:
 *
 *  - a MARKED room admits only the tenants on its marker;
 *  - an UNMARKED room admits everyone — deliberately.
 *
 * The second rule looks like a hole and is not. `filterRoomsOfTenant` already shows unmarked
 * rooms in EVERY tenant (rule "else keep"), so refusing them here would remove the admin's
 * ability to inspect and repair a room without removing anyone's exposure to it — and it
 * would break the documented runbook (delete a stale room, stamp a marker, claim an alias),
 * which is the only way an unmarked room ever becomes marked. The fix for an unmarked room
 * is `backfillMatrixRoomTenants`, not a denial here. Callers log a warning so the gap is
 * visible rather than silent.
 */
export function roomAdmitsTenant(roomTenants: string[], callerTenants: string[]): boolean {
  if (roomTenants.length === 0) return true;
  return roomTenants.some((t) => callerTenants.includes(t));
}

/**
 * Throw unless the caller's tenant may act on `roomId`.
 *
 * Synapse knows nothing about tenants: its admin API is homeserver-global, and every
 * admin callable here holds the ONE `@bk2-bot` token. So an `admin` of tenant elab could
 * list, inspect, rename and DELETE tenant scs's rooms — `admin` is a per-tenant role on a
 * single-tenant user, but the API it reached was not. This is the check that closes that,
 * using the same `org.okr.tenant` marker the client filter reads.
 *
 * Returns the room's marker so the caller can log it.
 */
export async function requireRoomInTenant(
  roomId: string,
  uid: string,
  fnName: string,
  adminToken: string,
): Promise<string[]> {
  const [roomTenants, callerTenants] = await Promise.all([
    getRoomTenants(roomId, adminToken),
    getUserTenants(uid),
  ]);
  if (!roomAdmitsTenant(roomTenants, callerTenants)) {
    console.error(`${fnName}: uid ${uid} (${callerTenants.join(',')}) may not act on room ${roomId} (${roomTenants.join(',')})`);
    // 'not-found', not 'permission-denied': confirming that a room id exists in another
    // tenant is itself a disclosure.
    throw new HttpsError('not-found', 'Room not found.');
  }
  if (roomTenants.length === 0) {
    console.warn(`${fnName}: room ${roomId} carries no ${OKR_TENANT_EVENT} marker — visible to every tenant. Run backfillMatrixRoomTenants.`);
  }
  return roomTenants;
}

/**
 * Read the tenant marker of many rooms at once, bounded so a large homeserver cannot turn
 * one admin listing into a thousand serial round-trips.
 */
export async function getRoomTenantsBatch(
  roomIds: string[],
  adminToken: string,
  concurrency = 16,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const queue = [...roomIds];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      result.set(next, await getRoomTenants(next, adminToken).catch(() => []));
    }
  });
  await Promise.all(workers);
  return result;
}

/** Hostname used as the Matrix server_name (homeserver host without the `matrix.` prefix). */
export function serverHostname(): string {
  return new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
}

/**
 * Ensure the admin (whose token we hold) has joined the room, so subsequent
 * invite/kick/state client-API calls are permitted even in invite-only rooms (SEC-1).
 * Best-effort: failures are logged, not thrown (the follow-up call surfaces them).
 */
export async function ensureAdminInRoom(roomId: string, adminToken: string): Promise<void> {
  const whoamiResp = await fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  if (!whoamiResp.ok) {
    console.warn(`ensureAdminInRoom: whoami failed → ${whoamiResp.status}`);
    return;
  }
  const { user_id: adminUserId } = await whoamiResp.json() as { user_id: string };
  if (!adminUserId) return;
  const joinResp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: adminUserId }),
    }
  );
  if (joinResp.ok) return;

  const joinErr = await joinResp.text();
  if (joinResp.status !== 403) {
    console.warn(`ensureAdminInRoom: join for ${adminUserId} → ${joinResp.status}: ${joinErr}`);
    return;
  }

  // 403 on an invite-only room the admin is not in yet: the admin-join API can only add a
  // user to a room the admin is already in. `make_room_admin` is the documented escalation —
  // it uses a local member that still holds power in the room to invite + promote the given
  // user (PL 100). It is what makes AOC room actions (rename, alias, invite) work on rooms
  // nobody explicitly added the bot to. Requires a local user with power in the room; if
  // there is none, Synapse says so and the follow-up call surfaces the real failure.
  const promote = () => fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: adminUserId }),
    }
  );

  // Synapse rate-limits make_room_admin to roughly one call per minute. A backfill over
  // several rooms therefore gets one success and then a wall of
  // `429 M_LIMIT_EXCEEDED {retry_after_ms: ~60000}` — which looked like a permission problem
  // but is pure pacing. Wait out the interval Synapse names (capped, once) instead of failing.
  let promoteResp = await promote();
  if (promoteResp.status === 429) {
    const body = await promoteResp.text();
    let waitMs = 60_000;
    try { waitMs = (JSON.parse(body) as { retry_after_ms?: number }).retry_after_ms ?? waitMs; } catch { /* keep default */ }
    waitMs = Math.min(waitMs + 2_000, 90_000);
    console.log(`ensureAdminInRoom: make_room_admin rate-limited for ${roomId}, waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    promoteResp = await promote();
  }
  if (!promoteResp.ok) {
    console.warn(`ensureAdminInRoom: join → 403 (${joinErr}); make_room_admin → ${promoteResp.status}: ${await promoteResp.text()}`);
    return;
  }

  // make_room_admin invites and promotes; the invite still has to be accepted.
  const retryResp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: adminUserId }),
    }
  );
  if (!retryResp.ok) {
    console.warn(`ensureAdminInRoom: join after make_room_admin → ${retryResp.status}: ${await retryResp.text()}`);
  } else {
    console.log(`ensureAdminInRoom: ${adminUserId} joined ${roomId} via make_room_admin`);
  }
}

/**
 * Invite + admin-force-join a Matrix user into a room. Idempotent: invite errors
 * are ignored ("already invited/joined"), join errors throw.
 */
export async function forceJoinUserToRoom(roomId: string, matrixUserId: string, adminToken: string): Promise<void> {
  // Invite first so the force-join succeeds on invite-only rooms (SEC-1).
  await fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: matrixUserId }),
    }
  );
  const joinResp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: matrixUserId }),
    }
  );
  if (!joinResp.ok) {
    const errText = await joinResp.text();
    // Idempotent: Synapse returns M_FORBIDDEN "<user> is already in the room." when the
    // target is already a member. That is the desired end-state, not a failure — treat it
    // as success (mirrors kickUserFromRoom tolerating M_NOT_IN_ROOM).
    if (errText.includes('already in the room')) {
      console.log(`forceJoinUserToRoom: ${matrixUserId} already in room ${roomId} (treated as joined)`);
      return;
    }
    throw new HttpsError('internal', `Failed to join ${matrixUserId} to room ${roomId}: ${errText}`);
  }
}

/**
 * Admit a PERSON into a room: provision their Matrix account, get the admin into the room
 * (invites are only permitted from a member in invite-only rooms, SEC-1), then invite and
 * force-join the person.
 *
 * WHY SHARED. `resolveChatRoomForPerson` exists because two copies of the room-PICKING branch
 * drifted apart and produced duplicate rooms (S5). Admitting the person is the second half of
 * that same operation, and the price of a second copy was the workflow outbox posting a damage
 * report into a room the reporter was never in.
 *
 * @returns the Matrix user id that was admitted.
 */
export async function ensurePersonInRoom(
  roomId: string,
  personKey: string,
  hostname: string,
  adminToken: string,
): Promise<string> {
  const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
  await ensureMatrixUserExists(matrixUserId, adminToken, { personKey });
  await ensureAdminInRoom(roomId, adminToken);
  await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
  return matrixUserId;
}

/**
 * Kick a Matrix user from a room. Idempotent: M_NOT_IN_ROOM is tolerated.
 * @returns true if a kick actually happened.
 */
export async function kickUserFromRoom(roomId: string, matrixUserId: string, adminToken: string, reason: string): Promise<boolean> {
  const kickResp = await fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: matrixUserId, reason }),
    }
  );
  if (!kickResp.ok) {
    const errText = await kickResp.text();
    if (errText.includes('M_NOT_IN_ROOM') || errText.includes('not in room')) return false;
    throw new HttpsError('internal', `Failed to kick ${matrixUserId} from room ${roomId}: ${errText}`);
  }
  return true;
}
