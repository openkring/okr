import { AvatarInfo, DiaryModel } from '@okr/shared-models';

import { diaryAvatarName } from './diary-avatar.util';

/**
 * The fallback icon of every diary location: free text, or a linked location without an uploaded
 * logo. A linked location with a logo (coat of arms, flag) still shows that logo.
 */
export const DIARY_TEXT_LOCATION_ICON = 'location';

/** How many location avatars a diary list row shows at most (main location first). */
export const DIARY_LIST_MAX_LOCATIONS = 3;

/** The avatar key `location.<okey>`; '' for free text, so the avatar pipe shows the fallback icon. */
export function diaryLocationAvatarKey(a: AvatarInfo): string {
  return a.key ? `location.${a.key}` : '';
}

/** The visible name of a location, as stored — a trailing canton ('Stäfa ZH') included. */
export function diaryLocationLabel(a: AvatarInfo): string {
  return diaryAvatarName(a);
}

/** The locations a list row shows, in order (the first one is the main location), capped at `max`. */
export function diaryListLocations(d: Pick<DiaryModel, 'locations'>, max = DIARY_LIST_MAX_LOCATIONS): AvatarInfo[] {
  return (d.locations ?? []).slice(0, max);
}
