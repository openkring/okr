import { enforce, staticSuite, test } from 'vest';

import { DiarySourceModel } from '@okr/shared-models';

/** Spec 1.77 §12.4 — one period per diary: `von` must not be after `bis` (both optional). */
export const diarySourcesValidations = staticSuite((model: DiarySourceModel) => {
  // Also the suite's one always-present rule: Vest reports a suite without any test as not valid.
  test('pulls', 'notArray', () => {
    enforce(Array.isArray(model.pulls)).isTruthy();
  });
  test('period', '@profile/feature.diarySources.period.error', () => {
    if (model.from && model.to) enforce(model.from <= model.to).isTruthy();
  });
});
