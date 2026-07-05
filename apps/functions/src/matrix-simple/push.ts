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
} from './shared';

/**
 * Send an FCM push notification to all room members when a video call is started.
 * Called by the caller's client right after placing the call.
 *
 * Input: { roomId, roomName, callerName, calleeMatrixUserIds: string[] }
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

    const { roomId, roomName, callerName, calleeMatrixUserIds } = request.data as {
      roomId: string;
      roomName: string;
      callerName: string;
      calleeMatrixUserIds: string[];
    };

    if (!Array.isArray(calleeMatrixUserIds) || calleeMatrixUserIds.length === 0) {
      return { sent: 0 };
    }

    const db = getFirestore();

    // Collect { uid, token } pairs for all callees
    const tokenEntries: { uid: string; token: string }[] = [];

    for (const matrixUserId of calleeMatrixUserIds) {
      // @personKey:homeserver → personKey
      const personKey = matrixUserId.replace(/^@/, '').split(':')[0];
      const usersSnap = await db.collection('users').where('personKey', '==', personKey).limit(1).get();
      if (usersSnap.empty) continue;

      const uid = usersSnap.docs[0].id;
      const tokensSnap = await db.collection('users').doc(uid).collection('fcmTokens').get();
      for (const tokenDoc of tokensSnap.docs) {
        const token = tokenDoc.data()['token'] as string | undefined;
        if (token) tokenEntries.push({ uid, token });
      }
    }

    if (tokenEntries.length === 0) return { sent: 0 };

    // Build the deep-link URL: navigate to the chat page for this room.
    // Convention: room name "Notfall" → page id "notfall_chat" → /private/notfall_chat
    // ?selectedRoom passes the Matrix room ID directly so the right room is pre-selected.
    const chatPageId = (roomName ?? '').toLowerCase().replace(/\s+/g, '_') + '_chat';
    const chatUrl = `/private/${chatPageId}?selectedRoom=${encodeURIComponent(roomId)}`;

    const tokens = tokenEntries.map(e => e.token);
    // Data-only message (no notification field): ensures the service worker's
    // onBackgroundMessage handler is always called on web. When notification is
    // present, some browsers auto-display it and skip the SW handler entirely.
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        type: 'video-call',
        title: `📹 Video-Anruf von ${callerName}`,
        body: roomName ? `In ${roomName}` : 'Eingehender Video-Anruf',
        roomId,
        roomName: roomName ?? '',
        callerName: callerName ?? '',
        url: chatUrl,
        // Badge count for the PWA Badging API in the service worker.
        // Video calls are always urgent, so at minimum 1.
        // Future: compute real total (unread chat + open tasks) per recipient.
        badgeCount: '1',
      },
      android: {
        priority: 'high',
      },
      apns: {
        // 'alert' push type is required for iOS to show a banner when the app is closed.
        // 'background' would deliver silently and never show a banner.
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            alert: {
              title: `📹 Video-Anruf von ${callerName}`,
              body: roomName ? `In ${roomName}` : 'Eingehender Video-Anruf',
            },
            badge: 1,
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    });

    // Remove tokens that are no longer registered to avoid future failures
    const staleTokenDeletions: Promise<unknown>[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        const { uid, token } = tokenEntries[i];
        const tokenDocId = token.substring(0, 128);
        staleTokenDeletions.push(
          db.collection('users').doc(uid).collection('fcmTokens').doc(tokenDocId).delete()
            .catch(err => console.warn('sendCallNotification: Failed to delete stale token:', err))
        );
      }
    });
    await Promise.all(staleTokenDeletions);

    console.log(`sendCallNotification: sent=${response.successCount} failed=${response.failureCount} room=${roomId}`);
    return { sent: response.successCount };
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
 * Register an HTTP pusher with Synapse on behalf of the calling user (S3 + SEC-2).
 *
 * Done server-side so the gateway shared secret never ships in the client bundle: the
 * CF mints a short-lived user token via the admin API and calls /pushers/set with the
 * secret-bearing gateway URL, which is required to end with /_matrix/push/v1/notify
 * (Synapse rejects any other URL with 400 — the original S3 bug).
 *
 * Input: { pushkey (FCM token), deviceDisplayName?, lang?, appId? }
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
    const { pushkey, deviceDisplayName, lang, appId } = request.data as {
      pushkey: string; deviceDisplayName?: string; lang?: string; appId?: string;
    };
    if (!pushkey) throw new HttpsError('invalid-argument', 'pushkey is required');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const localpart = await requireMatrixLocalpart(uid, 'registerMatrixPusher');
    const matrixUserId = `@${localpart}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    // Mint a short-lived user token so we can call /pushers/set as the user.
    const loginResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid_until_ms: Date.now() + 5 * 60 * 1000 }),
      }
    );
    if (!loginResp.ok) {
      throw new HttpsError('internal', `Failed to mint Matrix token: ${await loginResp.text()}`);
    }
    const { access_token } = await loginResp.json() as { access_token: string };

    const appIdToUse = appId || PUSH_APP_ID;
    const deviceName = (deviceDisplayName || 'Unknown').substring(0, 100);

    // Prune stale pushers for THIS device before registering the new one. The FCM token
    // ("pushkey") rotates (SW reinstall, browser eviction, reinstall), and because the
    // pushkey is part of a pusher's identity, each rotation leaves an orphaned pusher
    // behind — Synapse's append:false only replaces an *identical* pushkey+app_id. The
    // orphans accumulate, so one chat message fans out to every stale pushkey and the user
    // is notified multiple times (the "notified twice" complaint). We delete pushers with
    // the same app_id + device_display_name but a different pushkey, converging each
    // physical device to a single active pusher while preserving genuine multi-device use.
    try {
      const listResp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/pushers`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (listResp.ok) {
        const { pushers } = (await listResp.json()) as {
          pushers?: Array<{ app_id: string; pushkey: string; device_display_name?: string }>;
        };
        const stale = (pushers ?? []).filter(
          (p) => p.app_id === appIdToUse && p.device_display_name === deviceName && p.pushkey !== pushkey
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
          data: { url },
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

export const matrixPushGateway = onRequest(
  { cors: false, region: 'europe-west6', secrets: [pushGatewaySecret] },
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
      const unread     = notification.counts?.unread ?? 1;
      const title      = (roomName ? `${senderName} in ${roomName}` : senderName).substring(0, 200);
      // Cap the body so a malformed/abusive payload can't push an oversized notification.
      const msgBody    = ((notification.content?.['body'] as string | undefined) ?? 'Neue Nachricht').substring(0, 500);
      const roomId     = notification.room_id ?? '';

      const rejectedTokens: string[] = [];

      for (const device of notification.devices) {
        const token = device.pushkey;
        if (!token) continue;
        // Only deliver to our own app's pusher entries.
        if (device.app_id && device.app_id !== PUSH_APP_ID) continue;

        try {
          await getMessaging().send({
            token,
            data: {
              type: 'chat',
              title,
              body: msgBody,
              roomId,
              badgeCount: String(Math.max(1, unread)),
            },
            android: { priority: 'high' },
            apns: {
              headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
              payload: {
                aps: {
                  alert: { title, body: msgBody },
                  badge: Math.max(1, unread),
                  sound: 'default',
                  // NOTE: intentionally NO 'content-available': 1 here. Combining a
                  // user-facing `alert` with the background/silent `content-available`
                  // flag is undefined per Apple and on some iOS versions causes the push
                  // to be delivered twice (OS banner + background wake) — the "notified
                  // twice" complaint. Chat pushes only need the visible banner.
                },
              },
            },
          });
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

      console.log(`matrixPushGateway: room=${roomId} rejected=${rejectedTokens.length}`);
      res.status(200).json({ rejected: rejectedTokens });
    } catch (err) {
      console.error('matrixPushGateway: Unexpected error:', err);
      res.status(200).json({ rejected: [] }); // always 200 so Synapse doesn't retry
    }
  }
);
