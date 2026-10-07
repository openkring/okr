import { enforce, staticSuite, test } from 'vest';

import { DiaryPeriod } from '@okr/shared-models';

/**
 * Spec 1.77 D7 — the travel period a diary app publishes (`AppConfig.travelFrom`/`travelTo`).
 * Both bounds are optional; when both are set, `travelFrom` must not be after `travelTo`.
 * The `travelTo` test runs on every call (it only enforces when both bounds are set), so it is
 * also the suite's always-present rule: Vest reports a suite in which no test ran as not valid,
 * and an empty, open period must still be saveable.
 */
export const diaryPeriodValidations = staticSuite((model: DiaryPeriod) => {
  test('travelTo', '@content/diary/feature.period.error', () => {
    const from = model?.travelFrom ?? '';
    const to = model?.travelTo ?? '';
    if (from && to) enforce(from <= to).isTruthy();
  });
});
