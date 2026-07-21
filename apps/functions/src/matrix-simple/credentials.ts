// apps/functions/src/matrix-simple/credentials.ts
//
// Matrix account lifecycle: Firebase→Matrix token exchange, user provisioning,
// profile sync, and deactivation.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  requireUserPersonKey,
  requireProvisionedUser,
  requireRole,
  requireParam,
  checkRateLimit,
  resolvePersonDisplayName,
  setMatrixDisplayName,
  resolvePersonAvatarUrl,
  personAvatarUrl,
  setMatrixAvatarUrl,
  uploadUrlToMatrixMedia,
  serverHostname,
} from './shared';

export interface MatrixAuthResponse {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

/**
 * Simple Firebase -> Matrix Token Exchange
 * 
 * Call this from your app after Firebase authentication
 */
export const getMatrixCredentials = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<MatrixAuthResponse> => {
    try {
      // Get Firebase ID token from request context
      const firebaseUid = request.auth?.uid;
      if (!firebaseUid) {
        throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
      }

      // Get full user record from Firebase
      const userRecord = await getAuth().getUser(firebaseUid);

      console.log(`Getting Matrix credentials for Firebase user: ${firebaseUid}`);

      // Derive Matrix user ID from Person.okey (consistent across all chat scenarios).
      // SEC-3: requireMatrixLocalpart is the provisioning gate — throws for any caller
      // without a users/{uid}.personKey instead of minting a UID-based duplicate account.
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      checkRateLimit(firebaseUid, 'getMatrixCredentials', 10); // token minting — tightest limit
      // Raw personKey is needed to look up persons/{personKey} (case-sensitive);
      // the Matrix localpart is that key lowercased.
      const personKey = await requireUserPersonKey(firebaseUid, 'getMatrixCredentials');
      const localpart = personKey.toLowerCase();
      const matrixUserId = `@${localpart}:${hostname}`;

      // Desired Matrix display name: the person's real name is the source of truth
      // (persons/{personKey}), falling back to the Firebase profile only when the
      // person doc has no name. Password users have no Firebase Auth displayName, so
      // without the person lookup accounts would fall back to the raw localpart/uid.
      const desiredDisplayName =
        (await resolvePersonDisplayName(personKey)) ||
        userRecord.displayName ||
        userRecord.email?.split('@')[0] ||
        firebaseUid;

      // Desired Matrix avatar SOURCE: the person's avatar (avatars/person.<personKey>) is
      // the source of truth, falling back to the Firebase profile photo. This https URL is
      // the image we upload to the Synapse media repo to obtain the spec-compliant mxc://
      // URI actually stored in avatar_url (see the fill block below).
      const desiredAvatarUrl =
        (await resolvePersonAvatarUrl(personKey)) ||
        userRecord.photoURL ||
        undefined;

      // Check if Matrix user exists, and capture its current display name + avatar so we
      // only rewrite them when they actually need it.
      let matrixUserExists = false;
      let existingDisplayName: string | undefined;
      let existingAvatarUrl: string | undefined;
      try {
        const checkUserResponse = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${matrixAdminToken.value()}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (checkUserResponse.ok) {
          matrixUserExists = true;
          const existing = await checkUserResponse.json() as { displayname?: string; avatar_url?: string };
          existingDisplayName = existing.displayname ?? undefined;
          existingAvatarUrl = existing.avatar_url ?? undefined;
          console.log(`Matrix user ${matrixUserId} already exists`);
        }
      } catch (error) {
        console.log(`Matrix user ${matrixUserId} does not exist, will create`);
      }

      // Create Matrix user if doesn't exist
      if (!matrixUserExists) {
        const createUserResponse = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${matrixAdminToken.value()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              displayname: desiredDisplayName,
              admin: false,
              deactivated: false,
            }),
          }
        );

        if (!createUserResponse.ok) {
          const errorText = await createUserResponse.text();
          throw new HttpsError('internal', `Failed to create Matrix user: ${errorText}`);
        }

        console.log(`Created Matrix user: ${matrixUserId} (${desiredDisplayName})`);
      }

      // Generate Matrix access token for the user
      // Note: This requires Synapse admin API to generate tokens
      const loginResponse = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${matrixAdminToken.value()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valid_until_ms: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days (refreshed on each app init; H-6)
          }),
        }
      );

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new HttpsError('internal', `Failed to generate Matrix access token: ${errorText}`);
      }

      const loginData = await loginResponse.json() as {
        access_token: string;
      };

      console.log(`Generated Matrix access token for ${matrixUserId}`);

      // Self-heal the Matrix display name for existing accounts (SCS-13). Legacy
      // accounts were created before the person name was used, so many show the raw
      // MXID (empty display name) or an email-localpart placeholder. Rewrite it from
      // the person's real name whenever it has drifted — but never when it already
      // matches (avoids a needless admin write on every login).
      if (matrixUserExists && existingDisplayName !== desiredDisplayName) {
        await setMatrixDisplayName(matrixUserId, desiredDisplayName, matrixAdminToken.value());
        console.log(
          `getMatrixCredentials: synced display name for ${matrixUserId} ` +
          `("${existingDisplayName ?? ''}" → "${desiredDisplayName}")`
        );
      }

      // Fill an empty avatar (newly-created OR legacy account) from the person's avatar,
      // stored as a spec-compliant mxc:// URI (uploaded to the Synapse media repo) so
      // Element and bridges render it — not just this app. Only fills when empty — never
      // overwrites a custom avatar the user set. Best-effort: an upload failure logs and
      // never breaks the token exchange.
      if (!existingAvatarUrl && desiredAvatarUrl) {
        try {
          const mxc = await uploadUrlToMatrixMedia(desiredAvatarUrl, matrixAdminToken.value());
          await setMatrixAvatarUrl(matrixUserId, mxc, matrixAdminToken.value());
          console.log(`getMatrixCredentials: set avatar for ${matrixUserId} → ${mxc}`);
        } catch (e) {
          console.warn(`getMatrixCredentials: avatar mxc sync failed for ${matrixUserId}: ${(e as Error).message}`);
        }
      }

      return {
        accessToken: loginData.access_token,
        userId: matrixUserId,
        deviceId: `firebase_${firebaseUid}`,
        homeserverUrl: MATRIX_HOMESERVER,
      };
    } catch (error) {
      console.error('Error getting Matrix credentials:', error);
      throw error;
    }
  }
);

/**
 * Provision a Matrix account for a target user by their Person.okey (personKey).
 * Called when the current user wants to start a direct chat with someone who
 * hasn't logged in yet and therefore has no Matrix account.
 * Uses the Synapse admin API, so no password or login from the target user is needed.
 */
export const provisionMatrixUser = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ matrixUserId: string }> => {
    // Provisioning a Matrix account for a person is part of the normal direct-chat
    // flow — any provisioned app user may do it (creating accounts only for real persons).
    const callerUid = await requireProvisionedUser(request, 'provisionMatrixUser');
    checkRateLimit(callerUid, 'provisionMatrixUser', 20);
    const { personKey } = request.data as { personKey: string };
    requireParam(personKey, 'personKey');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    // Check if the user already exists
    const checkResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (checkResp.ok) {
      const checkData = await checkResp.json() as { deactivated?: boolean };
      if (checkData.deactivated) {
        console.log(`provisionMatrixUser: ${matrixUserId} exists but is deactivated — reactivating`);
        const reactivateResp = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ deactivated: false }),
          }
        );
        if (!reactivateResp.ok) {
          throw new HttpsError('internal', `Failed to reactivate ${matrixUserId}: ${await reactivateResp.text()}`);
        }
        console.log(`provisionMatrixUser: ${matrixUserId} reactivated`);
      } else {
        console.log(`provisionMatrixUser: ${matrixUserId} already exists and is active`);
      }
      return { matrixUserId };
    }
    console.log(`provisionMatrixUser: ${matrixUserId} not found (status=${checkResp.status}), creating...`);

    // Resolve a display name from the persons Firestore doc
    let displayName = personKey;
    try {
      const doc = await getFirestore().collection('persons').doc(personKey).get();
      const d = doc.data();
      if (d) {
        const fullName = [d['firstName'], d['lastName']].filter(Boolean).join(' ');
        if (fullName) displayName = fullName;
      }
    } catch { /* fallback to personKey */ }

    // Create the Matrix user via admin API (no password required)
    const createResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayname: displayName, admin: false, deactivated: false }),
      }
    );
    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new HttpsError('internal', `Failed to provision Matrix user ${matrixUserId}: ${errText}`);
    }

    console.log(`provisionMatrixUser: Created Matrix user ${matrixUserId} (${displayName})`);
    return { matrixUserId };
  }
);

/**
 * Deactivate a Matrix user by their personKey.
 * Deactivation prevents the user from logging in and optionally erases all their
 * messages and media from the Synapse database.
 * Note: Synapse does not hard-delete users; deactivation is the canonical "delete" operation.
 */
export const deactivateMatrixUser = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ matrixUserId: string; deactivated: boolean }> => {
    await requireRole(request, 'deactivateMatrixUser', ['admin']);

    const { personKey, erase = false } = request.data as { personKey: string; erase?: boolean };
    requireParam(personKey, 'personKey');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`deactivateMatrixUser: deactivating ${matrixUserId} (erase=${erase})`);

    // Check the user exists before attempting deactivation
    const checkResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!checkResp.ok) {
      console.warn(`deactivateMatrixUser: user ${matrixUserId} not found, nothing to deactivate`);
      return { matrixUserId, deactivated: false };
    }

    const deactivateResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/deactivate/${encodeURIComponent(matrixUserId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erase }),
      }
    );

    if (!deactivateResp.ok) {
      throw new HttpsError('internal', `Failed to deactivate ${matrixUserId}: ${await deactivateResp.text()}`);
    }

    console.log(`deactivateMatrixUser: ${matrixUserId} deactivated (erase=${erase})`);
    return { matrixUserId, deactivated: true };
  }
);

/**
 * Sync Firebase profile to Matrix
 *
 * Call this when user updates their profile in Firebase
 */
export const syncFirebaseProfileToMatrix = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ success: boolean }> => {
    try {
      const firebaseUid = request.auth?.uid;
      if (!firebaseUid) {
        throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
      }

      const userRecord = await getAuth().getUser(firebaseUid);
      const hostname = serverHostname();
      checkRateLimit(firebaseUid, 'syncFirebaseProfileToMatrix', 10);
      const personKey = await requireUserPersonKey(firebaseUid, 'syncFirebaseProfileToMatrix');
      const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;

      // Prefer the person's real name (persons/{personKey}); fall back to the Firebase
      // profile. Set via the Synapse admin API so it works for password users too (who
      // carry no Firebase Auth displayName).
      const desiredDisplayName =
        (await resolvePersonDisplayName(personKey)) ||
        userRecord.displayName ||
        userRecord.email?.split('@')[0];

      if (desiredDisplayName) {
        await setMatrixDisplayName(matrixUserId, desiredDisplayName, matrixAdminToken.value());
      }

      // Fill an empty Matrix avatar from the person's avatar (never overwrite a custom one).
      // Stored as a spec-compliant mxc:// URI (uploaded to the Synapse media repo) so
      // Element and bridges render it. Best-effort — an upload failure never breaks the sync.
      const desiredAvatarUrl = await resolvePersonAvatarUrl(personKey);
      if (desiredAvatarUrl) {
        const checkResp = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
          { headers: { Authorization: `Bearer ${matrixAdminToken.value()}` } }
        );
        const existingAvatarUrl = checkResp.ok
          ? ((await checkResp.json() as { avatar_url?: string }).avatar_url ?? undefined)
          : undefined;
        if (!existingAvatarUrl) {
          try {
            const mxc = await uploadUrlToMatrixMedia(desiredAvatarUrl, matrixAdminToken.value());
            await setMatrixAvatarUrl(matrixUserId, mxc, matrixAdminToken.value());
          } catch (e) {
            console.warn(`syncFirebaseProfileToMatrix: avatar mxc sync failed for ${matrixUserId}: ${(e as Error).message}`);
          }
        }
      }

      console.log(`Synced profile to Matrix for ${matrixUserId} ("${desiredDisplayName ?? ''}")`);

      return { success: true };
    } catch (error) {
      console.error('Error syncing profile to Matrix:', error);
      throw error;
    }
  }
);

interface DisplayNameRepairEntry {
  matrixUserId: string;
  from: string;
  to: string;
}

interface DisplayNameRepairResult {
  scanned: number;
  repaired: DisplayNameRepairEntry[];
  skippedNoPerson: string[];
  skippedCustomName: DisplayNameRepairEntry[];
  applied: boolean;
}

/**
 * Bulk-repair Matrix display names (SCS-13, admin only).
 *
 * Many legacy accounts show the bare MXID because their Synapse display name is empty
 * or a placeholder (the localpart / an email-localpart) — the display name was never
 * synced from the person's real name. This scans every Synapse user and, for each one
 * whose display name is a placeholder, rewrites it to "Firstname Lastname" from
 * `persons/{personKey}`.
 *
 * The localpart→person mapping is built from a single `persons` collection scan
 * (localpart = doc id lowercased), which lets us recover the case-sensitive person doc
 * from the lowercased Matrix localpart.
 *
 * `dryRun` (default true) reports what WOULD change without writing — use it to review
 * the list first, then call again with `dryRun: false` to apply. Accounts that already
 * carry a real, non-placeholder custom name are never overwritten (reported under
 * `skippedCustomName`).
 */
export const repairMatrixDisplayNames = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<DisplayNameRepairResult> => {
    await requireRole(request, 'repairMatrixDisplayNames', ['admin']);
    const dryRun = (request.data as { dryRun?: boolean } | undefined)?.dryRun !== false; // default true
    const adminToken = matrixAdminToken.value();

    // 1. Build localpart → "Firstname Lastname" from a single persons scan.
    const nameByLocalpart = new Map<string, string>();
    const personsSnap = await getFirestore().collection('persons').get();
    personsSnap.forEach((doc) => {
      const d = doc.data();
      const full = [d['firstName'], d['lastName']].filter(Boolean).join(' ').trim();
      if (full) nameByLocalpart.set(doc.id.toLowerCase(), full);
    });

    const result: DisplayNameRepairResult = {
      scanned: 0,
      repaired: [],
      skippedNoPerson: [],
      skippedCustomName: [],
      applied: !dryRun,
    };

    // 2. Page through all Synapse users.
    let from = 0;
    const limit = 100;
    for (;;) {
      const resp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v2/users?from=${from}&limit=${limit}&guests=false&deactivated=false`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (!resp.ok) {
        throw new HttpsError('internal', `Failed to list Matrix users: ${await resp.text()}`);
      }
      const data = await resp.json() as {
        users: Array<{ name: string; displayname?: string; user_type?: string | null }>;
        next_token?: string;
      };

      for (const u of data.users) {
        // Only touch normal local users (skip appservice/bots/support users).
        if (u.user_type) continue;
        result.scanned++;

        const matrixUserId = u.name; // @localpart:server
        const localpart = matrixUserId.replace(/^@/, '').split(':')[0];
        const current = (u.displayname ?? '').trim();
        const desired = nameByLocalpart.get(localpart);

        if (!desired) {
          result.skippedNoPerson.push(matrixUserId);
          continue;
        }
        if (current === desired) continue; // already correct

        // A placeholder is an empty name, the bare localpart, or the full MXID.
        const isPlaceholder = current === '' || current === localpart || current === matrixUserId;
        if (!isPlaceholder) {
          // A real custom name that differs from the person name — leave it alone.
          result.skippedCustomName.push({ matrixUserId, from: current, to: desired });
          continue;
        }

        if (!dryRun) {
          await setMatrixDisplayName(matrixUserId, desired, adminToken);
        }
        result.repaired.push({ matrixUserId, from: current, to: desired });
      }

      if (data.next_token === undefined) break;
      from = Number(data.next_token);
    }

    console.log(
      `repairMatrixDisplayNames: scanned=${result.scanned} ` +
      `repaired=${result.repaired.length} noPerson=${result.skippedNoPerson.length} ` +
      `customName=${result.skippedCustomName.length} applied=${result.applied}`
    );
    return result;
  }
);

interface AvatarRepairEntry {
  matrixUserId: string;
  avatarUrl: string;
}

interface AvatarRepairResult {
  scanned: number;
  repaired: AvatarRepairEntry[];      // blank avatar → filled with the person avatar (mxc)
  migratedHttp: AvatarRepairEntry[];  // legacy https avatar → re-uploaded to the media repo as mxc
  skippedNoAvatar: string[];   // no person avatar available for the account
  skippedHasAvatar: number;    // account already has an mxc avatar — left untouched
  applied: boolean;
}

/**
 * Bulk-repair Matrix avatars to spec-compliant mxc:// URIs (admin only).
 *
 * Two cases are fixed so avatars render everywhere (this app, Element, bridges), not just
 * in our own client:
 *  - Accounts WITHOUT an avatar are filled from the person's avatar
 *    (`avatars/person.<personKey>`, the same doc the app reads).
 *  - Accounts carrying a legacy https `avatar_url` (an imgix URL an earlier version set,
 *    which only our client renders) are migrated: the image is re-uploaded to the Synapse
 *    media repo and `avatar_url` is rewritten to the resulting mxc:// URI.
 * Accounts that already carry an mxc:// avatar are never overwritten (counted under
 * `skippedHasAvatar`) — this preserves any custom avatar a user set in Element.
 *
 * The localpart→avatar mapping is built from a single `avatars` collection scan
 * (doc id `person.<personKey>`, localpart = personKey lowercased).
 *
 * `dryRun` (default true) reports what WOULD change without writing — review the list,
 * then call again with `dryRun: false` to apply.
 */
export const repairMatrixAvatars = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<AvatarRepairResult> => {
    await requireRole(request, 'repairMatrixAvatars', ['admin']);
    const dryRun = (request.data as { dryRun?: boolean } | undefined)?.dryRun !== false; // default true
    const adminToken = matrixAdminToken.value();

    // 1. Build localpart → avatar URL from a single avatars scan. Only person avatars
    //    (doc id `person.<key>`) map to Matrix users; skip org/resource/etc. avatars.
    const avatarByLocalpart = new Map<string, string>();
    const avatarsSnap = await getFirestore().collection('avatars').get();
    avatarsSnap.forEach((doc) => {
      if (!doc.id.startsWith('person.')) return;
      const storagePath = doc.data()['storagePath'] as string | undefined;
      if (!storagePath) return;
      const personKey = doc.id.slice('person.'.length);
      avatarByLocalpart.set(personKey.toLowerCase(), personAvatarUrl(storagePath));
    });

    const result: AvatarRepairResult = {
      scanned: 0,
      repaired: [],
      migratedHttp: [],
      skippedNoAvatar: [],
      skippedHasAvatar: 0,
      applied: !dryRun,
    };

    // 2. Page through all Synapse users.
    let from = 0;
    const limit = 100;
    for (;;) {
      const resp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v2/users?from=${from}&limit=${limit}&guests=false&deactivated=false`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (!resp.ok) {
        throw new HttpsError('internal', `Failed to list Matrix users: ${await resp.text()}`);
      }
      const data = await resp.json() as {
        users: Array<{ name: string; avatar_url?: string; user_type?: string | null }>;
        next_token?: string;
      };

      for (const u of data.users) {
        // Only touch normal local users (skip appservice/bots/support users).
        if (u.user_type) continue;
        result.scanned++;

        const matrixUserId = u.name; // @localpart:server
        const localpart = matrixUserId.replace(/^@/, '').split(':')[0];

        const current = (u.avatar_url ?? '').trim();

        // Already a spec-compliant mxc avatar (migrated, or a custom avatar the user set in
        // Element) — never overwrite.
        if (current.startsWith('mxc://')) {
          result.skippedHasAvatar++;
          continue;
        }

        // Legacy https avatar (one WE set — the imgix URL) — migrate it to mxc by
        // re-uploading the same image to the Synapse media repo so Element and bridges render it.
        if (current.startsWith('http')) {
          try {
            const mxc = dryRun ? current : await uploadUrlToMatrixMedia(current, adminToken);
            if (!dryRun) await setMatrixAvatarUrl(matrixUserId, mxc, adminToken);
            result.migratedHttp.push({ matrixUserId, avatarUrl: mxc });
          } catch (e) {
            console.warn(`repairMatrixAvatars: http→mxc failed for ${matrixUserId}: ${(e as Error).message}`);
            result.skippedNoAvatar.push(matrixUserId);
          }
          continue;
        }

        // No avatar at all — fill from the person avatar, uploaded as mxc.
        const desiredHttp = avatarByLocalpart.get(localpart);
        if (!desiredHttp) {
          result.skippedNoAvatar.push(matrixUserId);
          continue;
        }
        try {
          const mxc = dryRun ? desiredHttp : await uploadUrlToMatrixMedia(desiredHttp, adminToken);
          if (!dryRun) await setMatrixAvatarUrl(matrixUserId, mxc, adminToken);
          result.repaired.push({ matrixUserId, avatarUrl: mxc });
        } catch (e) {
          console.warn(`repairMatrixAvatars: fill failed for ${matrixUserId}: ${(e as Error).message}`);
          result.skippedNoAvatar.push(matrixUserId);
        }
      }

      if (data.next_token === undefined) break;
      from = Number(data.next_token);
    }

    console.log(
      `repairMatrixAvatars: scanned=${result.scanned} ` +
      `repaired=${result.repaired.length} migratedHttp=${result.migratedHttp.length} ` +
      `noAvatar=${result.skippedNoAvatar.length} ` +
      `hasAvatar=${result.skippedHasAvatar} applied=${result.applied}`
    );
    return result;
  }
);
