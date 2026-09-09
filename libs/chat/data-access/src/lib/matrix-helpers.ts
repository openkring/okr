import type { MatrixClient, User } from 'matrix-js-sdk';

import { MatrixMessage, PersonModelName } from '@okr/shared-models';
import { imageMimeTypeForName } from '@okr/chat-util';
import { AvatarService } from '@okr/avatar-data-access';

/**
 * Hidden Matrix service/bot accounts (S1): never shown as members, never counted
 * for read receipts or DM labelling, never rung for calls.
 */
export const SERVICE_ACCOUNT_LOCALPARTS = new Set(['bk2-bot', 'bruno']);

/** True if the Matrix user ID belongs to a hidden service/bot account (S1). */
export function isServiceAccount(userId: string | undefined): boolean {
  if (!userId) return false;
  return SERVICE_ACCOUNT_LOCALPARTS.has(userId.split(':')[0].replace(/^@/, ''));
}

/**
 * The tenant's own avatar for a Matrix user, or undefined when this tenant has no picture
 * for that person.
 *
 * A Matrix profile is global — one identity per person across every tenant (see
 * matrix-simple/shared.resolvePersonAvatarUrl), so its picture can only ever be right for
 * one of them. The app's avatars are tenant-scoped (`<tenant>.person.<okey>` with the bare
 * `person.<okey>` as shared default, see avatarDocId), so wherever the chat renders a
 * *person* we prefer the local avatar and fall back to the Matrix profile picture. The
 * bridge between the two is the localpart: it is the person okey, lowercased.
 *
 * @param avatarService the tenant's avatar cache
 * @param userId the Matrix user id, e.g. `@kaiser:bkchat.etke.host`
 * @param size the desired edge length in px
 */
export function personAvatarUrl(avatarService: AvatarService, userId?: string | null, size = 96): string | undefined {
  if (!userId) return undefined;
  const key = `person.${userId.replace(/^@/, '').split(':')[0]}`;
  return avatarService.getCachedStoragePath(key)
    ? avatarService.getAvatarUrl(key, PersonModelName, size)
    : undefined;
}

/**
 * The Matrix profile picture of a user as an http(s) URL, or undefined when the user has
 * none. Only a fallback for {@link personAvatarUrl} — a Matrix profile is global, the
 * tenant's own picture wins.
 */
export function mxcAvatarHttpUrl(client: MatrixClient | null, user?: User, size = 96): string | undefined {
  if (!client || !user?.avatarUrl) return undefined;
  return client.mxcUrlToHttp(user.avatarUrl, size, size, 'crop', true) ?? undefined;
}

/**
 * The MIME hint to pass to resolveMediaUrl for a message's attachment: the event's own
 * `info.mimetype`, or — when the sending device left it empty — the type implied by the
 * filename. Without the fallback the blob keeps whatever the homeserver served (often
 * `application/octet-stream`); `<img>` sniffs raster formats anyway, but an SVG would
 * silently refuse to render.
 */
export function mediaMimeHint(msg: MatrixMessage): string | undefined {
  return (msg.content?.info?.mimetype as string | undefined) || imageMimeTypeForName(msg.body ?? '');
}
