import { AvatarInfo, DiaryModel } from '@okr/shared-models';

import { diaryAvatarName } from './diary-avatar.util';

/** The icon of a free-text location (no linked location record, key ''). */
export const DIARY_TEXT_LOCATION_ICON = 'location';

/** How many location avatars a diary list row shows at most (main location first). */
export const DIARY_LIST_MAX_LOCATIONS = 3;

/**
 * Fallback icon of a diary location avatar: 'location' for free text; undefined for a linked
 * location, which keeps the avatar's own default (its coat of arms or flag when there is one).
 */
export function diaryLocationIcon(a: AvatarInfo): string | undefined {
  return a.key ? undefined : DIARY_TEXT_LOCATION_ICON;
}

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
