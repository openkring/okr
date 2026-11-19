import { enforce, staticSuite, test } from 'vest';

import { APPLICATION_KIND_VALUES, CourseSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

/** Longest text a course section shows when no course is announced (bound by the config form). */
export const COURSE_EMPTY_TEXT_MAX_LENGTH = 500;

/** A course section: only known application kinds as audience, and a bounded «no course» text. */
export const courseSectionValidations = staticSuite((model: CourseSection) => {
  baseSectionValidations(model);
  const audience = model.properties?.audience ?? [];
  const emptyText = model.properties?.emptyText ?? '';

  test('audience', 'invalidValue', () => {
    enforce(audience.every((kind) => APPLICATION_KIND_VALUES.includes(kind))).isTruthy();
  });

  test('emptyText', 'maxLength', () => {
    enforce(emptyText.length).lessThanOrEquals(COURSE_EMPTY_TEXT_MAX_LENGTH);
  });
});
