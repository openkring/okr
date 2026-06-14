import { describe, expect, it } from 'vitest';
import { TRACKER_SECTION_SHAPE, TrackerSection } from '@bk2/shared-models';

import { trackerSectionValidations } from './tracker-section.validations';

describe('trackerSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(trackerSectionValidations({ ...TRACKER_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...TRACKER_SECTION_SHAPE, title: 123 } as unknown as TrackerSection;
    expect(trackerSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags an out-of-range interval', () => {
    const model = { ...TRACKER_SECTION_SHAPE, properties: { ...TRACKER_SECTION_SHAPE.properties, intervalInSeconds: 99999 } } as unknown as TrackerSection;
    expect(trackerSectionValidations(model).hasErrors('intervalInSeconds')).toBe(true);
  });
});
