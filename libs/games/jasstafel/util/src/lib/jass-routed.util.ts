import type { DiaryConsent, DiaryPull } from '@okr/shared-models';

/**
 * Does the result card offer «Ins Tagebuch» (spec 1.77 §12.5)? When this app's user allowed a diary to collect the
 * Jasstafel, or when this diary app pulls it from itself (`ownPull`). The date and the diary's own pull are checked on
 * the server only. Pure.
 */
export function jassRouted(
  user: { diaryConsents?: DiaryConsent[] } | undefined,
  ownPull: DiaryPull | undefined,
): boolean {
  const consented = (user?.diaryConsents ?? []).some((c) => (c.sources ?? []).includes('jasstafel'));
  return consented || (ownPull?.sources ?? []).includes('jasstafel');
}
