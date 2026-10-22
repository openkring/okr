import { enforce, staticSuite, test } from 'vest';

/** A from/to date range (StoreDates); `''` = open bound. */
export interface DiaryDateRange {
  from: string;
  to: string;
}

/**
 * Both bounds are optional; when both are set, `from` must not be after `to`.
 * The `to` test runs on every call (it only enforces when both bounds are set), so it is
 * also the suite's always-present rule: Vest reports a suite in which no test ran as not valid,
 * and an empty, open range must still be saveable.
 */
export const diaryDateRangeValidations = staticSuite((model: DiaryDateRange) => {
  test('to', '@content/diary/feature.validation.dateRangeInvalid', () => {
    const from = model?.from ?? '';
    const to = model?.to ?? '';
    if (from && to) enforce(from <= to).isTruthy();
  });
});
