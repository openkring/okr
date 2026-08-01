import { PrivacyUsage } from '@okr/shared-models';

/**
 * The photo declaration (`usageImages`) — helpers shared by the client and the Cloud Functions.
 *
 * `usageImages` is NOT an access control (spec 1.19, D-P4-10). It records what the person
 * declared about being photographed and about publication of their picture, addressed to the
 * photographer and the contentAdmin. No rule reads it, and no rule could: avatar bytes are
 * served unsigned from the imgix CDN. These helpers exist so the declaration can be *consulted*
 * — filtered in the person list, flagged in a row, honoured where honouring costs nothing.
 *
 * Legacy documents carry no `usageImages` at all (Firestore reads do not apply model defaults),
 * which is why every helper coalesces to the model default `PrivacyUsage.Public`: a person who
 * never expressed anything has not objected, and must not be reported as if they had.
 */

/** The filter value meaning "no photo-declaration filter applied". */
export const PHOTO_USAGE_ALL = 'all';

/** Item names of the `photoUsage` category, indexed by `PrivacyUsage`. */
const PHOTO_USAGE_NAMES: Record<number, string> = {
  [PrivacyUsage.Public]: 'public',
  [PrivacyUsage.Restricted]: 'restricted',
  [PrivacyUsage.Protected]: 'protected',
};

/** The `photoUsage` category item name for a declaration, defaulting to `public`. */
export function getPhotoUsageName(usageImages?: PrivacyUsage): string {
  return PHOTO_USAGE_NAMES[usageImages ?? PrivacyUsage.Public] ?? 'public';
}

/**
 * True when the person restricted the use of their picture in any way — i.e. anything other
 * than `Public`. This is what a list badge and a photographer's list are interested in;
 * the exact tier is the follow-up question.
 */
export function hasPhotoRestriction(usageImages?: PrivacyUsage): boolean {
  return (usageImages ?? PrivacyUsage.Public) !== PrivacyUsage.Public;
}

/**
 * True when the person objects to publication outright (`Protected`) — the tier a photographer
 * must act on before taking the picture, not only before publishing it.
 */
export function objectsToPhotos(usageImages?: PrivacyUsage): boolean {
  return (usageImages ?? PrivacyUsage.Public) === PrivacyUsage.Protected;
}

/** List-filter predicate: `all` (or an empty selection) passes everything. */
export function photoUsageMatches(usageImages: PrivacyUsage | undefined, selected: string): boolean {
  if (!selected || selected === PHOTO_USAGE_ALL) return true;
  return getPhotoUsageName(usageImages) === selected;
}
