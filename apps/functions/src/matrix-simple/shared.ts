// apps/functions/src/matrix-simple/shared.ts
//
// Shared configuration, authorization gates, and Synapse admin/client helpers
// for all matrix-simple modules (credentials, rooms, push, membership-sync).

import { HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';

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
 * Resolve a person's avatar URL from `avatars/person.<personKey>` (the same doc id
 * the app builds as `${PersonModelName}.${personKey}`). The `personKey` must be the
 * raw (case-sensitive) Firestore doc id. Returns undefined when the person has no
 * avatar doc or the doc carries no `storagePath`.
 */
export async function resolvePersonAvatarUrl(personKey: string): Promise<string | undefined> {
  try {
    const snap = await getFirestore().collection('avatars').doc(`person.${personKey}`).get();
    const storagePath = snap.data()?.['storagePath'] as string | undefined;
    return storagePath ? personAvatarUrl(storagePath) : undefined;
  } catch {
    return undefined;
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
export async function resolvePersonAvatarMxc(personKey: string, token: string): Promise<string | undefined> {
  const httpUrl = await resolvePersonAvatarUrl(personKey);
  if (!httpUrl) return undefined;
  return uploadUrlToMatrixMedia(httpUrl, token);
}

/**
 * Load the caller's roles map from users/{uid}. Empty object if the doc is missing.
 * Authorization in this project is derived from the user document's `roles` map
 * (the same model the client and Firestore rules use) — NOT from Firebase Auth
 * custom claims, which are never minted anywhere in this codebase.
 */
async function getCallerRoles(uid: string): Promise<Record<string, boolean>> {
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
  if (!joinResp.ok) {
    console.warn(`ensureAdminInRoom: join for ${adminUserId} → ${joinResp.status}: ${await joinResp.text()}`);
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
