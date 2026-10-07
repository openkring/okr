import { enforce, staticSuite, test } from 'vest';

import { DiaryTarget } from '@okr/shared-models';

/** Spec 1.77 §5.3 — one rule per column: `von` must not be after `bis` (both optional). */
export const diaryTransferValidations = staticSuite((targets: DiaryTarget[]) => {
  // Also the suite's one always-present rule: Vest reports a suite without any test as not
  // valid, and a user with no diary columns yet must still be able to save.
  test('diaryTargets', 'notArray', () => {
    enforce(Array.isArray(targets)).isTruthy();
  });
  for (const target of targets ?? []) {
    test(`${target.tenantId}.period`, '@profile/feature.diaryTransfer.period.error', () => {
      if (target.from && target.to) enforce(target.from <= target.to).isTruthy();
    });
  }
});

/**
 * Spec 1.77 §5.3 — the accordion's columns: one target per offered diary, in the order the
 * diaries are offered. A stored target keeps its values; a diary without one gets an empty,
 * opt-in target (nothing ticked, no period); a stored target for a diary no longer offered is
 * dropped (and so removed on the next save).
 */
export function mergeDiaryTargets(stored: DiaryTarget[] | undefined, offeredTenantIds: string[]): DiaryTarget[] {
  return offeredTenantIds.map((tenantId) => {
    const found = (stored ?? []).find((t) => t.tenantId === tenantId);
    return {
      tenantId,
      sources: [...(found?.sources ?? [])],
      from: found?.from ?? '',
      to: found?.to ?? '',
    };
  });
}
