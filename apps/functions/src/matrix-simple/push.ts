// apps/functions/src/matrix-simple/push.ts
//
// Push notification plumbing: video-call FCM pushes, Matrix pusher
// registration, and the Matrix→FCM push gateway endpoint.

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

import {
  matrixAdminToken,
  pushGatewaySecret,
  MATRIX_HOMESERVER,
  PUSH_APP_ID,
  PUSH_GATEWAY_BASE,
  requireMatrixLocalpart,
  requireProvisionedUser,
  checkRateLimit,
  getUserTenants,
  getRoomTenantMarker,
  chatDeepLink,
  groupKeyFromRoomAlias,
  directCounterpartOf,
  needsScopeRefresh,
  loadRoomFacts,
  loadTenantRoomScope,
  SCOPE_REFRESH_AFTER_MS,
  type CachedRoomFacts,
  type CachedTenantScope,
  getUserGlobalAccountData,
  isProtectedRoomAlias,
  muteBlocksPush,
  BoundedTtlCache,
  OKR_MUTE_EVENT,
} from './shared';
import { decideAdmission, type RoomFacts } from './room-admission';
import { fcmTokenDocId } from '@okr/shared-util-core';
import { addChatBadge } from '../badge/ledger';
import {
  appNameFor, buildTokenMessage, collectTokens, platformOf, readBadgeSumsOrNone, withAppName, type TokenEntry,
} from '../srv/push';

const chatPageCache = new BoundedTtlCache<boolean>(2_000, 5 * 60_000);
/** FCM allows 500 messages per `sendEach`. */
const CALL_SEND_CHUNK = 500;
const CHAT_PAGE_FAILURE_TTL_MS = 10_000;

/**
 * Does the group behind `groupKey` have a `<okey>_chat` CMS page to deep-link into?
 *
 * Reads the page itself (`pages/<okey>_chat`, PageCollection): `GroupStore.save()` creates it
 * alongside a real group, but not every group with a room has one (older groups, groups whose
 * page was removed), and `createAdhocChat` creates none at all. A missing or archived page
 * answers false. Any read failure answers false, too — a generic chat page is always safe, a 404
 * never is.
 */
export async function hasGroupChatPage(groupKey: string): Promise<boolean> {
  // Cached per group key: every chat push asks this.
  const now = Date.now();
  const hit = chatPageCache.get(groupKey, now);
  if (hit) return hit.value;
  try {
    const snap = await getFirestore().collection('pages').doc(`${groupKey}_chat`).get();
    const hasPage = snap.exists && snap.data()?.['isArchived'] !== true;
    chatPageCache.set(groupKey, hasPage, now);
    return hasPage;
  } catch (e) {
    console.warn(`hasGroupChatPage(${groupKey}) failed, linking to the generic chat page:`, e);
    chatPageCache.set(groupKey, false, now, CHAT_PAGE_FAILURE_TTL_MS);
    return false;
  }
}

/**
 * Send an FCM push notification to all room members when a video call is started.
 * Called by the caller's client right after placing the call.
 *
 * Input: { roomId, roomName, roomKey?, callerName, calleeMatrixUserIds: string[] }
 * Each Matrix user ID has the form @personKey:homeserver.
 * The CF extracts the personKey, looks up the Firebase UID in Firestore,
 * then sends a high-priority FCM message to every registered device.
 */
export const sendCallNotification = onCall(
  { cors: true, region: 'europe-west6', enforceAppCheck: true },
  async (request): Promise<{ sent: number }> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    checkRateLimit(request.auth.uid, 'sendCallNotification', 30);

    const { roomId, roomName, roomKey, callerName, calleeMatrixUserIds } = request.data as {
      roomId: string;
      roomName: string;
      /** Group okey, derived by the client from the room's canonical alias `#group_<okey>`. */
      roomKey?: string;
      callerName: string;
      calleeMatrixUserIds: string[];
    };

    if (!Array.isArray(calleeMatrixUserIds) || calleeMatrixUserIds.length === 0) {
      return { sent: 0 };
    }

    // The callees' accounts in the CALLER's tenant: the call is placed from one app, and a
    // callee who is also a member elsewhere must ring in that same app, not in whichever of
    // their accounts happens to sort first (see the head of `srv/push.ts`).
    const tenantId = (await getUserTenants(request.auth.uid))[0] ?? '';
    if (!tenantId) return { sent: 0 };
    const tokenEntries = await collectTokens(
      calleeMatrixUserIds.map((matrixUserId) => matrixUserId.replace(/^@/, '').split(':')[0]),
      tenantId,
    );

    if (tokenEntries.length === 0) return { sent: 0 };

    // Build the deep-link URL: navigate to the chat page for this room.
    // Convention: group okey "scs_notfall" → page id "scs_notfall_chat" (see GroupStore).
    //
    // The okey comes from the CLIENT, read off the room's canonical alias — it must NEVER be
    // derived from the room name again. That coupling only ever worked because rooms used to
    // be named by their key; since rooms carry the group's display name ("Freitags 8-er",
    // "Kandidat:innen & Instrukt."), a name-derived id would be blanks-and-colons garbage.
    // A key alone is not enough, though: not every group owns a `<okey>_chat` page.
    // Ad-hoc chats are group documents with `kind: 'chat'` and no page or sections —
    // `createAdhocChat` writes the document and the room, nothing else — and some real groups
    // have a room but no page, so their deep link would land on PageDispatcher's
    // `pageNotFound`. So fall back to the tenant's generic chat page whenever there is no key
    // (older client, or a room that is not a group room) or no live `<okey>_chat` page. ?selectedRoom
    // carries the Matrix room ID either way, so the right room is pre-selected regardless
    // of which page opens.
    const chatUrl = chatDeepLink(roomId, (roomKey && await hasGroupChatPage(roomKey)) ? roomKey : undefined);

    const appName = await appNameFor(tenantId);
    const title = withAppName(appName, `📹 Video-Anruf von ${callerName}`);
    // Data-only for the web (no notification field): ensures the service worker's
    // onBackgroundMessage handler is always called. When notification is present, some
    // browsers auto-display it and skip the SW handler entirely.
    const data: Record<string, string> = {
      type: 'video-call',
      tenantId,
      title,
      body: roomName ? `In ${roomName}` : 'Eingehender Video-Anruf',
      roomId,
      roomName: roomName ?? '',
      callerName: callerName ?? '',
      url: chatUrl,
      // No badge field: a call is not a pending item. The service worker re-applies its
      // ledger total (spec 1.93) — the old `badgeCount: '1'` overwrote it.
    };
    // Native (N5, spec 1.127): a visible alert per token, no `content-available` (undefined next
    // to an alert per Apple), and the account's server ledger sum instead of a constant 1 — a
    // call does not change the ledger, it only must not overwrite the badge with a wrong value.
    const sums = await readBadgeSumsOrNone(tokenEntries.map((e) => e.uid), 'sendCallNotification');
    const messages = tokenEntries.map((entry) =>
      buildTokenMessage(entry, data, sums.get(entry.uid), { priority: 'high', tag: `call.${roomId}` }));

    let successCount = 0;
    let failureCount = 0;
    // Remove tokens that are no longer registered to avoid future failures
    const staleTokenDeletions: Promise<unknown>[] = [];
    for (let start = 0; start < messages.length; start += CALL_SEND_CHUNK) {
      const chunkEntries = tokenEntries.slice(start, start + CALL_SEND_CHUNK);
      const response = await getMessaging().sendEach(messages.slice(start, start + CALL_SEND_CHUNK));
      successCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          const { uid, docId } = chunkEntries[i];
          staleTokenDeletions.push(
            getFirestore().collection('users').doc(uid).collection('fcmTokens').doc(docId).delete()
              .catch(err => console.warn('sendCallNotification: Failed to delete stale token:', err))
          );
        }
      });
    }
    await Promise.all(staleTokenDeletions);

    console.log(`sendCallNotification: sent=${successCount} failed=${failureCount} room=${roomId}`);
    return { sent: successCount };
  }
);

/**
 * Matrix Push Gateway (https://spec.matrix.org/v1.6/push-gateway-api/)
 *
 * The Synapse homeserver calls this endpoint (server-to-server) whenever a
 * push rule fires for a user.  We forward it as an FCM message so the device
 * shows a notification banner even when the app is not running.
 *
 * The FCM token ("pushkey") arrives in the payload from Synapse — no Firestore
 * look-up required.  The client registers this pusher via MatrixChatService.setPusher().
 */
/**
 * Mint a short-lived (5 min) Matrix user token via the Synapse admin API, so a callable can
 * act as the calling user (e.g. /pushers/set). Shared by register/unregisterMatrixPusher.
 */
async function mintMatrixUserToken(
  uid: string,
  fn: string
): Promise<{ accessToken: string; matrixUserId: string }> {
  const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
  const localpart = await requireMatrixLocalpart(uid, fn);
  const matrixUserId = `@${localpart}:${hostname}`;
  const loginResp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${matrixAdminToken.value()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid_until_ms: Date.now() + 5 * 60 * 1000 }),
    }
  );
  if (!loginResp.ok) {
    throw new HttpsError('internal', `Failed to mint Matrix token: ${await loginResp.text()}`);
  }
  const { access_token } = await loginResp.json() as { access_token: string };
  return { accessToken: access_token, matrixUserId };
}

/**
 * The tenant stored on a Matrix pusher: the client's app tenant when it is one of the account's
 * tenants, else the account's first tenant (with a warning for a foreign value). '' when the
 * account has none. Pure apart from the log line.
 */
export function pusherTenantFor(requested: unknown, accountTenants: string[], uid: string): string {
  if (typeof requested === 'string' && requested && accountTenants.includes(requested)) return requested;
  if (requested !== undefined && requested !== null && requested !== '') {
    console.warn(`registerMatrixPusher: tenant ${String(requested).substring(0, 50)} is not one of ${uid}'s tenants, using ${accountTenants[0] ?? '(none)'}`);
  }
  return accountTenants[0] ?? '';
}

/** A pusher as listed by Synapse's GET /pushers; `data` is what registerMatrixPusher stored. */
export interface ListedPusher {
  app_id: string;
  pushkey: string;
  device_display_name?: string;
  data?: Record<string, unknown>;
}

/**
 * The pushers a new registration replaces. A pusher's identity is app_id + device + tenant: one
 * person's tenant apps share one Matrix account and one user agent, so without the tenant each app
 * would delete the other's chat pusher. A pusher without a stored tenant (registered before tenants
 * were recorded) is only treated as this app's when the account has a single tenant.
 */
export function stalePushersToPrune(
  pushers: ListedPusher[],
  me: { appId: string; deviceName: string; pushkey: string; tenantId: string },
  accountTenants: string[]
): ListedPusher[] {
  return pushers.filter((p) => {
    if (p.app_id !== me.appId || p.device_display_name !== me.deviceName || p.pushkey === me.pushkey) return false;
    const stored = p.data?.['tenantId'];
    if (typeof stored === 'string' && stored) return stored === me.tenantId;
    return accountTenants.length <= 1;
  });
}

/**
 * Register an HTTP pusher with Synapse on behalf of the calling user (S3 + SEC-2).
 *
 * Done server-side so the gateway shared secret never ships in the client bundle: the
 * CF mints a short-lived user token via the admin API and calls /pushers/set with the
 * secret-bearing gateway URL, which is required to end with /_matrix/push/v1/notify
 * (Synapse rejects any other URL with 400 — the original S3 bug).
 *
 * Input: { pushkey (FCM token), deviceDisplayName?, lang?, appId?, tenantId? (the app's tenant) }
 */
export const registerMatrixPusher = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken, pushGatewaySecret],
  },
  async (request): Promise<{ registered: boolean }> => {
    const uid = await requireProvisionedUser(request, 'registerMatrixPusher');
    checkRateLimit(uid, 'registerMatrixPusher', 10);
    const { pushkey, deviceDisplayName, lang, appId, tenantId } = request.data as {
      pushkey: string; deviceDisplayName?: string; lang?: string; appId?: string;
      /** The registering app's build tenant (1.127 final review M1); absent from older clients. */
      tenantId?: unknown;
    };
    if (!pushkey) throw new HttpsError('invalid-argument', 'pushkey is required');

    const { accessToken: access_token, matrixUserId } = await mintMatrixUserToken(uid, 'registerMatrixPusher');

    const appIdToUse = appId || PUSH_APP_ID;
    // Echoed back by Synapse as `devices[].data` on every push, so matrixPushGateway can send a
    // room's messages only to the apps of the room's tenants (spec 1.93 §3). The tenant of the
    // APP that registers this token — named by the client, accepted only if it is one of the
    // account's tenants; older clients (or a foreign value) fall back to the account's first.
    const accountTenants = await getUserTenants(uid);
    const pusherTenantId = pusherTenantFor(tenantId, accountTenants, uid);
    const deviceName = (deviceDisplayName || 'Unknown').substring(0, 100);

    // Prune stale pushers for THIS device before registering the new one. The FCM token
    // ("pushkey") rotates (SW reinstall, browser eviction, reinstall), and because the
    // pushkey is part of a pusher's identity, each rotation leaves an orphaned pusher
    // behind — Synapse's append:false only replaces an *identical* pushkey+app_id. The
    // orphans accumulate, so one chat message fans out to every stale pushkey and the user
    // is notified multiple times (the "notified twice" complaint). We delete pushers with
    // the same app_id + device_display_name + tenant but a different pushkey, converging each
    // physical device's app to a single active pusher while preserving genuine multi-device use
    // and the other tenant apps on the same device (they share the Matrix account and user agent).
    try {
      const listResp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/pushers`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (listResp.ok) {
        const { pushers } = (await listResp.json()) as {
          pushers?: ListedPusher[];
        };
        const stale = stalePushersToPrune(
          pushers ?? [],
          { appId: appIdToUse, deviceName, pushkey, tenantId: pusherTenantId },
          accountTenants
        );
        await Promise.all(
          stale.map((p) =>
            fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/pushers/set`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
              // kind:null deletes the pusher (Matrix spec).
              body: JSON.stringify({ app_id: p.app_id, pushkey: p.pushkey, kind: null }),
            })
          )
        );
        if (stale.length) {
          console.log(`registerMatrixPusher: pruned ${stale.length} stale pusher(s) for ${matrixUserId}`);
        }
      }
    } catch (err) {
      console.warn('registerMatrixPusher: stale-pusher pruning failed (non-critical):', err);
    }

    // The URL path MUST be exactly /_matrix/push/v1/notify (Synapse validation); the secret
    // travels as a query param (excluded from the path) and is verified by matrixPushGateway.
    const url = `${PUSH_GATEWAY_BASE}/_matrix/push/v1/notify?secret=${encodeURIComponent(pushGatewaySecret.value())}`;
    const setResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/pushers/set`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'http',
          app_id: appIdToUse,
          app_display_name: 'BK2 Chat',
          device_display_name: deviceName,
          pushkey,
          lang: lang || 'de',
          // matrixUserId lets matrixPushGateway read this user's `org.okr.mute` (spec 1.109 §9).
          // uid is the Firebase user of THIS app (the Matrix account is shared across tenants), so
          // the gateway finds users/{uid}/badge/counts. Set here, never by the client.
          data: { url, matrixUserId, uid, ...(pusherTenantId ? { tenantId: pusherTenantId } : {}) },
          append: false,
        }),
      }
    );
    if (!setResp.ok) {
      throw new HttpsError('internal', `pushers/set failed: ${await setResp.text()}`);
    }
    console.log(`registerMatrixPusher: registered pusher for ${matrixUserId}`);
    return { registered: true };
  }
);

/**
 * Remove this device's Matrix pusher on logout (spec 1.127 phase 1), so Synapse stops sending
 * chat pushes to a logged-out device. Deletes every pusher of the caller with the given
 * pushkey (any app_id). An unknown pushkey is not an error: `{ removed: false }`.
 *
 * Input: { pushkey (FCM token) }
 */
export const unregisterMatrixPusher = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ removed: boolean }> => {
    const uid = await requireProvisionedUser(request, 'unregisterMatrixPusher');
    checkRateLimit(uid, 'unregisterMatrixPusher', 10);
    const { pushkey } = request.data as { pushkey?: string };
    if (!pushkey) throw new HttpsError('invalid-argument', 'pushkey is required');

    const removed = await removeMatrixPushers(uid, [pushkey], 'unregisterMatrixPusher');
    return { removed: removed > 0 };
  }
);

/**
 * Delete the given pushkeys' Matrix pushers of `uid`'s Matrix account (any app_id): one minted
 * user token, one `GET /pushers`, and a `pushers/set kind:null` only for listed pushers whose
 * pushkey is in `pushkeys` — never another device's pusher (a person's Matrix account is shared
 * by all their tenant apps). Returns the number of pushers deleted; an unknown pushkey is not an
 * error. Throws when the uid has no Matrix account or Synapse fails.
 */
export async function removeMatrixPushers(
  uid: string,
  pushkeys: string[],
  fn = 'removeMatrixPushers'
): Promise<number> {
  if (pushkeys.length === 0) return 0;
  const wanted = new Set(pushkeys);
  const { accessToken, matrixUserId } = await mintMatrixUserToken(uid, fn);

  const listResp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/pushers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listResp.ok) {
    throw new HttpsError('internal', `pushers list failed: ${await listResp.text()}`);
  }
  const { pushers } = (await listResp.json()) as {
    pushers?: Array<{ app_id: string; pushkey: string }>;
  };
  const matches = (pushers ?? []).filter((p) => wanted.has(p.pushkey));
  await Promise.all(
    matches.map(async (p) => {
      const resp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/pushers/set`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        // kind:null deletes the pusher (Matrix spec).
        body: JSON.stringify({ app_id: p.app_id, pushkey: p.pushkey, kind: null }),
      });
      if (!resp.ok) {
        throw new HttpsError('internal', `pushers/set (delete) failed: ${await resp.text()}`);
      }
    })
  );
  console.log(`${fn}: removed ${matches.length} pusher(s) for ${matrixUserId}`);
  return matches.length;
}

/**
 * A room's `org.okr.tenant` marker, cached per instance: one chat message fans out to one
 * gateway call per pusher, and the marker changes rarely. A failed read is `undefined`
 * (unmarked) — delivered as before, never dropped on a Synapse hiccup.
 */
const MARKER_TTL_MS = 5 * 60_000;
const MARKER_FAILURE_TTL_MS = 10_000;
const markerCache = new BoundedTtlCache<{ marker: string[] | undefined; failed: boolean }>(2_000, MARKER_TTL_MS);

/**
 * `failed` tells a failed read apart from «no marker» (strict read): since spec 1.127 2.1 an
 * unmarked room is checked against the tenant's rooms, and a room whose marker could not be read
 * must not be subjected to that check — it is delivered, as before. A failure is cached briefly.
 */
async function cachedRoomTenantMarker(roomId: string, adminToken: string): Promise<{ marker: string[] | undefined; failed: boolean }> {
  const now = Date.now();
  const hit = markerCache.get(roomId, now);
  if (hit) return hit.value;
  try {
    const read = { marker: await getRoomTenantMarker(roomId, adminToken, { strict: true }), failed: false };
    markerCache.set(roomId, read, now);
    return read;
  } catch (err) {
    console.warn(`matrixPushGateway: marker read failed for ${roomId}, delivering:`, err);
    const read = { marker: undefined, failed: true };
    markerCache.set(roomId, read, now, MARKER_FAILURE_TTL_MS);
    return read;
  }
}

/**
 * A room's canonical alias localpart (`#group_scs_support:host` → `group_scs_support`; '' when the
 * room has none), from the cached room facts. `undefined` = the read failed: the gateway then
 * treats the room as protected (fails open — a support room must never be silenced).
 */
function aliasLocalpartOf(facts: CachedRoomFacts | undefined): string | undefined {
  if (!facts) return undefined;
  const alias = facts.canonicalAlias ?? '';
  return alias.startsWith('#') ? alias.slice(1).split(':')[0] : '';
}

/**
 * A user's `org.okr.mute` account data, cached per user for 60 s (spec 1.109 §9) and bounded —
 * the instance is long-lived. A failed read FAILS OPEN: `undefined` (= nothing muted) is cached
 * for a few seconds only, so a slow Synapse neither drops pushes nor is hammered.
 */
const MUTE_TTL_MS = 60_000;
const MUTE_FAILURE_TTL_MS = 10_000;
const muteCache = new BoundedTtlCache<Record<string, unknown> | undefined>(5_000, MUTE_TTL_MS);

async function cachedUserMute(matrixUserId: string, adminToken: string): Promise<Record<string, unknown> | undefined> {
  const now = Date.now();
  const hit = muteCache.get(matrixUserId, now);
  if (hit) return hit.value;
  try {
    const mute = await getUserGlobalAccountData(matrixUserId, OKR_MUTE_EVENT, adminToken);
    muteCache.set(matrixUserId, mute, now);
    return mute;
  } catch (err) {
    console.warn(`matrixPushGateway: mute read failed for ${matrixUserId}, delivering unmuted:`, err);
    muteCache.set(matrixUserId, undefined, now, MUTE_FAILURE_TTL_MS);
    return undefined;
  }
}

/**
 * Whether the room is a support/Notfall room for the pusher's app. An unknown alias (failed read)
 * counts as protected (fail open). A pusher without a tenant is checked against the room's marker.
 */
function roomIsProtected(aliasLocalpart: string | undefined, tenantId: string | undefined, roomMarker: string[] | undefined): boolean {
  if (aliasLocalpart === undefined) return true;
  if (aliasLocalpart === '') return false;
  const tenants = tenantId ? [tenantId] : (roomMarker ?? []);
  return isProtectedRoomAlias(aliasLocalpart, '') || tenants.some((t) => isProtectedRoomAlias(aliasLocalpart, t));
}

/**
 * Whether one pusher gets this room's message (spec 1.127 2.1): `decideAdmission` on the room's
 * marker, the facts with THIS pusher's DM counterpart, and the scope of THIS pusher's tenant. On a
 * DM-counterpart miss against a scope older than 60 s the scope is reloaded once and the decision
 * repeated — a person who joined the tenant minutes ago is not dropped for the cache TTL (Review
 * Focus 1). Any failed read leaves facts or scope `undefined`, which delivers (Review Focus 2).
 */
async function admitsDevice(
  roomMarker: string[] | undefined,
  pusherTenant: string | undefined,
  cachedFacts: CachedRoomFacts | undefined,
  matrixUserId: string | undefined,
  sender: string | undefined,
  scopeOf: (tenant: string, refreshIfOlderThan?: number) => Promise<CachedTenantScope | undefined>,
): Promise<boolean> {
  // Marked room, or a pusher without tenant: the marker alone decides — no scope read.
  if (roomMarker !== undefined || !pusherTenant || !cachedFacts) {
    return decideAdmission(roomMarker, pusherTenant, cachedFacts, undefined);
  }
  const ownId = typeof matrixUserId === 'string' && matrixUserId.startsWith('@') ? matrixUserId : undefined;
  const facts: RoomFacts = {
    roomId: cachedFacts.roomId,
    canonicalAlias: cachedFacts.canonicalAlias,
    creator: cachedFacts.creator,
    directCounterpart: directCounterpartOf(cachedFacts.members, ownId, sender),
  };
  const scope = await scopeOf(pusherTenant);
  if (decideAdmission(undefined, pusherTenant, facts, scope)) return true;
  if (!scope || !needsScopeRefresh(facts, scope, Date.now() - scope.loadedAt)) return false;
  const fresh = await scopeOf(pusherTenant, SCOPE_REFRESH_AFTER_MS);
  return decideAdmission(undefined, pusherTenant, facts, fresh);
}

interface MatrixPushDevice {
  app_id: string;
  pushkey: string;
  pushkey_ts?: number;
  data?: Record<string, string>;
  tweaks?: Record<string, string>;
}

interface MatrixPushPayload {
  notification?: {
    event_id?: string;
    room_id?: string;
    type?: string;
    sender?: string;
    sender_display_name?: string;
    room_name?: string;
    room_alias?: string;
    content?: Record<string, unknown>;
    counts?: { unread?: number; missed_calls?: number };
    devices?: MatrixPushDevice[];
    priority?: string;
  };
}

/**
 * The account whose server badge ledger this pusher feeds: `data.uid`, set server-side by
 * `registerMatrixPusher` (never by the client). A pusher belongs to one app and so to one uid,
 * while its Matrix account is shared by all tenant apps of the person (Review Focus 2).
 * `undefined` for an older pusher without uid, or for anything that is no plausible uid.
 */
export function ledgerTargetOf(device: Pick<MatrixPushDevice, 'data'>): string | undefined {
  const uid: unknown = device.data?.['uid'];
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128 ? uid : undefined;
}

/** Counts the chat event in the account's ledger; a failed write costs the badge, not the push. */
async function chatBadgeFor(uid: string, eventId: string): Promise<number | undefined> {
  try {
    return await addChatBadge(uid, eventId);
  } catch (err) {
    console.warn('matrixPushGateway: badge ledger write failed, sending without badge:', err);
    return undefined;
  }
}

/** The token doc's `platform` (older builds: none); a failed read reads as unknown. */
async function tokenPlatformOf(uid: string, token: string): Promise<TokenEntry['platform']> {
  try {
    const snap = await getFirestore().collection('users').doc(uid).collection('fcmTokens').doc(fcmTokenDocId(token)).get();
    return snap.exists ? platformOf(snap.data()?.['platform']) : undefined;
  } catch (err) {
    console.warn('matrixPushGateway: token platform read failed, using the default channel:', err);
    return undefined;
  }
}

function withPlatform(platform: TokenEntry['platform']): Pick<TokenEntry, 'platform'> {
  return platform ? { platform } : {};
}

export const matrixPushGateway = onRequest(
  { cors: false, region: 'europe-west6', secrets: [pushGatewaySecret, matrixAdminToken] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    // SEC-2: only Synapse (which stores the secret-bearing pusher URL set by
    // registerMatrixPusher) knows the secret. Reject any caller that does not present it,
    // so the gateway can no longer be used as an open notification relay. The secret is a
    // query param because Synapse forces the URL path to be exactly /_matrix/push/v1/notify.
    const expectedSecret = pushGatewaySecret.value();
    const providedSecret = (req.query?.['secret'] as string | undefined) ?? '';
    if (!expectedSecret || providedSecret !== expectedSecret) {
      console.warn('matrixPushGateway: rejected request with missing/invalid secret');
      res.status(403).json({ rejected: [] });
      return;
    }

    try {
      const body = req.body as MatrixPushPayload;
      const notification = body?.notification;

      if (!notification?.devices?.length) {
        res.status(200).json({ rejected: [] });
        return;
      }

      // Synapse sends a "clearing"/badge-update notification (no event_id, empty room_id)
      // whenever the unread count changes — e.g. right after the user reads a message on
      // any device. We must NOT forward it as an FCM message: doing so (a) re-set the app
      // icon badge to 1 moments after the in-app read had cleared it (the "badge won't
      // disappear" bug) and (b) rendered a bogus "Neue Nachricht" banner with no content.
      // The badge is reconciled to the true unread total client-side on app resume, so
      // dropping these pushes is safe. See MatrixInitializationService (badge reconcile).
      if (!notification.event_id) {
        console.log('matrixPushGateway: dropped clearing/badge-only notification (no event_id)');
        res.status(200).json({ rejected: [] });
        return;
      }

      const senderName = notification.sender_display_name ?? notification.sender ?? 'Unbekannt';
      const roomName   = notification.room_name ?? notification.room_alias ?? '';
      const title      = (roomName ? `${senderName} in ${roomName}` : senderName).substring(0, 200);
      // Cap the body so a malformed/abusive payload can't push an oversized notification.
      const msgBody    = ((notification.content?.['body'] as string | undefined) ?? 'Neue Nachricht').substring(0, 500);
      const roomId     = notification.room_id ?? '';

      const rejectedTokens: string[] = [];
      // One Matrix account serves every tenant app of a person; send a room's message only to
      // the apps of the room's tenants (spec 1.93 §3). Skipped devices are NOT `rejected` —
      // that would make Synapse delete a healthy pusher.
      const adminToken = matrixAdminToken.value();
      const markerRead = roomId ? await cachedRoomTenantMarker(roomId, adminToken) : { marker: undefined, failed: false };
      const roomMarker = markerRead.marker;
      // Spec 1.127 2.1: the room's facts (alias, creator, the 2 members of a DM) — read once per
      // notification, cached per room. `undefined` = Synapse failed or was slow (3 s bound): the
      // push is then delivered as before (Review Focus 2) and the room counts as protected.
      const roomFacts = roomId ? await loadRoomFacts(roomId, adminToken) : undefined;
      const aliasLocalpart = aliasLocalpartOf(roomFacts);
      // A failed marker read must not look «unmarked» to the admission rule: without facts it delivers.
      const admissionFacts = markerRead.failed ? undefined : roomFacts;
      // Deep link: the group behind a `#group_<okey>` alias, if it owns a `<okey>_chat` page.
      const aliasGroupKey = groupKeyFromRoomAlias(roomFacts?.canonicalAlias);
      const chatUrl = roomId
        ? chatDeepLink(roomId, (aliasGroupKey && await hasGroupChatPage(aliasGroupKey)) ? aliasGroupKey : undefined)
        : '';
      // Tenant scope, read at most once per distinct pusher tenant and notification.
      const scopes = new Map<string, Promise<CachedTenantScope | undefined>>();
      const scopeOf = (tenant: string, refreshIfOlderThan?: number) => {
        const key = refreshIfOlderThan === undefined ? tenant : `${tenant}\u0000refresh`;
        let scope = scopes.get(key);
        if (!scope) {
          scope = loadTenantRoomScope(tenant, { refreshIfOlderThan });
          scopes.set(key, scope);
        }
        return scope;
      };
      let skippedForeign = 0;
      let skippedMuted = 0;

      for (const device of notification.devices) {
        const token = device.pushkey;
        if (!token) continue;
        // Only deliver to our own app's pusher entries.
        if (device.app_id && device.app_id !== PUSH_APP_ID) continue;
        const pusherTenant = device.data?.['tenantId'] || undefined;
        const matrixUserId = device.data?.['matrixUserId'];
        if (!(await admitsDevice(roomMarker, pusherTenant, admissionFacts, matrixUserId, notification.sender, scopeOf))) {
          // Both kinds of skip: a marker naming other tenants, or an unmarked room this app
          // does not show (spec 1.127 2.1).
          skippedForeign++;
          continue;
        }
        // Mute (spec 1.109 §9): the pusher's owner muted this room or this app. Pushers registered
        // before `matrixUserId` was put into their data carry none → delivered (dies out with
        // the next app start). Never `rejected` — the pusher is healthy.
        if (roomId && typeof matrixUserId === 'string' && matrixUserId.startsWith('@')) {
          const mute = await cachedUserMute(matrixUserId, adminToken);
          if (mute) {
            const isProtected = roomIsProtected(aliasLocalpart, pusherTenant, roomMarker);
            if (muteBlocksPush(mute, roomId, pusherTenant, Date.now(), isProtected)) {
              skippedMuted++;
              continue;
            }
          }
        }

        try {
          // The badge (spec 1.127 §3.7 B1): this message counted once in the ledger of the
          // ACCOUNT behind this pusher (`data.uid`), not of the Matrix account — one Matrix
          // account serves every tenant app of a person, each app has its own uid and ledger.
          // An older pusher without uid gets no ledger write and no badge (never a guess).
          const uid = ledgerTargetOf(device);
          const badge = uid ? await chatBadgeFor(uid, notification.event_id) : undefined;
          const entry: TokenEntry = {
            token, uid: uid ?? '', docId: fcmTokenDocId(token),
            ...(uid ? withPlatform(await tokenPlatformOf(uid, token)) : {}),
          };
          const data: Record<string, string> = {
            type: 'chat',
            // The pusher's own tenant: the tenant of the app that registered this FCM token
            // (registerMatrixPusher validates the client's value against the account). Pushers of
            // older clients carry the account's first tenant instead, which is the same app for a
            // single-tenant account. With it, the service worker's tenant-mismatch drop (it
            // compares this to the app's okrTenantId) does not fire for a chat push; it lets the
            // worker and the tap handler know which app the push belongs to. Omitted for
            // pre-tenant pushers.
            ...(pusherTenant ? { tenantId: pusherTenant } : {}),
            title,
            body: msgBody,
            roomId,
            // Spec 1.127 2.3: open the room, not just the app.
            ...(chatUrl ? { url: chatUrl } : {}),
            // One new chat message for the web device ledger (spec 1.93). Never Synapse's
            // `counts.unread`: it spans every tenant's rooms and the badge's other parts are unknown.
            badgeAdd: 'chat',
            badgeId: notification.event_id,
          };
          // A visible alert, intentionally NO 'content-available': combining a user-facing
          // `alert` with the background flag is undefined per Apple and on some iOS versions
          // delivers the push twice (OS banner + background wake) — the "notified twice" complaint.
          await getMessaging().send(buildTokenMessage(entry, data, badge, { priority: 'high', tag: `chat.${roomId}` }));
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            rejectedTokens.push(token);
          } else {
            console.error(`matrixPushGateway: FCM send failed for ${token.substring(0, 20)}…:`, err);
          }
        }
      }

      console.log(`matrixPushGateway: room=${roomId} rejected=${rejectedTokens.length} skippedForeign=${skippedForeign} skippedMuted=${skippedMuted}`);
      res.status(200).json({ rejected: rejectedTokens });
    } catch (err) {
      console.error('matrixPushGateway: Unexpected error:', err);
      res.status(200).json({ rejected: [] }); // always 200 so Synapse doesn't retry
    }
  }
);
