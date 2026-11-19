import { describe, expect, it } from 'vitest';

import { COURSE_SECTION_SHAPE, CourseSection } from '@okr/shared-models';
import { COURSE_EMPTY_TEXT_MAX_LENGTH, courseSectionValidations } from './course-section.validations';
import { getSectionValidationSuite } from './section-validation-registry';

const model = (props: Partial<CourseSection['properties']>): CourseSection =>
  ({ ...COURSE_SECTION_SHAPE, properties: { ...COURSE_SECTION_SHAPE.properties, ...props } }) as CourseSection;

describe('courseSectionValidations (1.166)', () => {
  it('accepts the defaults and every known audience', () => {
    expect(courseSectionValidations(model({})).hasErrors('audience')).toBe(false);
    expect(courseSectionValidations(model({ audience: ['youth', 'adult', 'transfer'] })).hasErrors('audience')).toBe(false);
  });

  it('rejects an unknown audience value', () => {
    const result = courseSectionValidations(model({ audience: ['youth', 'other'] as never }));
    expect(result.hasErrors('audience')).toBe(true);
    expect(result.getErrors('audience')).toContain('invalidValue');
  });

  it('caps the empty text', () => {
    expect(courseSectionValidations(model({ emptyText: '' })).hasErrors('emptyText')).toBe(false);
    expect(courseSectionValidations(model({ emptyText: 'x'.repeat(COURSE_EMPTY_TEXT_MAX_LENGTH) })).hasErrors('emptyText')).toBe(false);
    const result = courseSectionValidations(model({ emptyText: 'x'.repeat(COURSE_EMPTY_TEXT_MAX_LENGTH + 1) }));
    expect(result.getErrors('emptyText')).toContain('tooLong');
  });

  it('is the registered suite for course', () => {
    expect(getSectionValidationSuite('course')(model({ audience: ['x'] as never })).hasErrors('audience')).toBe(true);
  });
});
