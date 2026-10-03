import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

import { DocumentCollection, FolderCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { IMGIX_PRIVATE_HOST, signImgixUrl } from '../_storage/imgix-sign';
import { privateBucket } from '../_storage/private-bucket';
import { getJoinedMemberIds, matrixAdminToken, requireUserPersonKey, serverHostname } from '../matrix-simple/shared';
import { audienceRoomOf, MAX_FOLDER_DEPTH, missingAncestors } from './video-audience.util';
import { contentDisposition, MP4_PARAMS, POSTER_PARAMS, validVideoKeys, videoAccessPath, windowExpiry } from './video-sign.util';

const CF_NAME = 'signVideoUrls';
const imgixPrivateToken = defineSecret('IMGIX_PRIVATE_TOKEN');

export interface SignedVideo {
  key: string;
  posterUrl: string;
  playback: { kind: 'mp4'; url: string };
  downloadUrl?: string;
}

/**
 * Signed imgix URLs for album videos in the private bucket (spec 1.82 §5). Any member of the
 * caller's tenant; documents that fail the access check or whose original is not (yet) in the
 * private bucket are silently left out — the client shows them as "not available".
 * Spec 1.82 §8: a video inside a chat room album (a folder chain whose nearest `matrixRoomId` names
 * a room) is signed only for the room's CURRENT joined members, read live from Synapse — never
 * from a Firestore copy. A failed Synapse lookup counts as "not joined" (fail closed).
 * `download: true` adds a signed GCS URL of the original (one IAM signBlob per document, so the
 * album list never asks for it — only the player and the zip download do).
 */
export const signVideoUrls = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true, secrets: [imgixPrivateToken, matrixAdminToken] },
  async (request: CallableRequest<{ docKeys?: string[]; download?: boolean }>): Promise<{ videos: SignedVideo[]; expires: number }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const expires = windowExpiry(Date.now());
    const keys = validVideoKeys(request.data?.docKeys);
    if (keys.length === 0) return { videos: [], expires };

    const db = getFirestore();
    const docs = await db.getAll(...keys.map(k => db.collection(DocumentCollection).doc(k)));
    const folderKeys = [...new Set(docs.flatMap(d => (d.data()?.['folderKeys'] as string[] | undefined) ?? []))].filter(Boolean);
    const folderSnaps = folderKeys.length ? await db.getAll(...folderKeys.map(k => db.collection(FolderCollection).doc(k))) : [];
    const folders: Record<string, Record<string, unknown> | undefined> = Object.fromEntries(folderSnaps.map(s => [s.id, s.data()]));
    // Load the ancestor chains too: a chat room album names its room on the ROOT folder only.
    let miss: string[];
    for (let rounds = 0; (miss = missingAncestors(folders)).length && rounds < MAX_FOLDER_DEPTH; rounds++) {
      const snaps = await db.getAll(...miss.map(k => db.collection(FolderCollection).doc(k)));
      for (const s of snaps) folders[s.id] = s.data();
    }
    const rooms = docs.map(d => audienceRoomOf((d.data()?.['folderKeys'] as string[] | undefined) ?? [], folders));
    const joined = await roomMembership(rooms, request.auth?.uid ?? '');

    const token = imgixPrivateToken.value();
    const expSeconds = Math.floor(expires / 1000);
    const bucket = privateBucket();
    const signed = await Promise.all(keys.map(async (key, i): Promise<SignedVideo | null> => {
      const path = videoAccessPath(docs[i].data(), folders, tenantId);
      if (!path) return null;
      if (rooms[i] && !joined.get(rooms[i])) return null;
      // One failing item (a GCS hiccup, a signBlob quota) must not reject the whole album page.
      try {
        const [exists] = await bucket.file(path).exists();
        if (!exists) return null;
        const video: SignedVideo = {
          key,
          posterUrl: signImgixUrl(IMGIX_PRIVATE_HOST, token, path, { ...POSTER_PARAMS, expires: expSeconds }),
          playback: { kind: 'mp4', url: signImgixUrl(IMGIX_PRIVATE_HOST, token, path, { ...MP4_PARAMS, expires: expSeconds }) },
        };
        if (request.data?.download) {
          [video.downloadUrl] = await bucket.file(path).getSignedUrl({
            version: 'v4', action: 'read', expires,
            responseDisposition: contentDisposition(String(docs[i].data()?.['title'] ?? ''), path),
          });
        }
        return video;
      } catch (error) {
        logger.warn(`${CF_NAME}: could not sign video ${key}`, { error: String(error) });
        return null;
      }
    }));
    const videos = signed.filter((v): v is SignedVideo => v !== null);
    logger.info(`${CF_NAME}: signed ${videos.length}/${keys.length} video(s) for tenant ${tenantId}`);
    return { videos, expires };
  },
);

/**
 * Whether the caller is a currently joined member of each distinct room in `rooms` (`''` = no room,
 * skipped). One Synapse lookup per distinct room; the caller's Matrix id is resolved only when at
 * least one room is involved. A lookup error is logged (room id only, never the token) and counts
 * as NOT joined.
 */
async function roomMembership(rooms: string[], uid: string): Promise<Map<string, boolean>> {
  const distinct = [...new Set(rooms.filter(Boolean))];
  const result = new Map<string, boolean>();
  if (distinct.length === 0) return result;
  let callerId: string;
  try {
    callerId = `@${(await requireUserPersonKey(uid, CF_NAME)).toLowerCase()}:${serverHostname()}`;
  } catch {
    // No linked person → no Matrix account → member of no room; plain videos stay signable.
    for (const roomId of distinct) result.set(roomId, false);
    return result;
  }
  const adminToken = matrixAdminToken.value();
  await Promise.all(distinct.map(async roomId => {
    try {
      result.set(roomId, (await getJoinedMemberIds(roomId, adminToken)).has(callerId));
    } catch (error) {
      logger.warn(`${CF_NAME}: room membership lookup failed, treating caller as not joined`, { roomId, error: String(error) });
      result.set(roomId, false);
    }
  }));
  return result;
}
