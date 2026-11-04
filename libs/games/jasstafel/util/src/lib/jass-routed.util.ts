import type { DiaryConsent, DiaryPull, DiaryTarget } from '@okr/shared-models';

/**
 * Does the result card offer «Ins Tagebuch» (spec 1.77 §12.5)? When this app's user allowed a diary to collect the
 * Jasstafel, when this diary app pulls it from itself (`ownPull`), or by an old target until those are removed. The
 * date and the diary's own pull are checked on the server only. Pure.
 */
export function jassRouted(
  user: { diaryConsents?: DiaryConsent[]; diaryTargets?: DiaryTarget[] } | undefined,
  ownPull: DiaryPull | undefined,
): boolean {
  const names = (list: { sources?: string[] }[] | undefined) => (list ?? []).some((e) => (e.sources ?? []).includes('jasstafel'));
  return names(user?.diaryConsents) || names(user?.diaryTargets) || (ownPull?.sources ?? []).includes('jasstafel');
}
