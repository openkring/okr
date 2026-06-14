import { describe, expect, it } from 'vitest';
import { MAP_SECTION_SHAPE, MapSection } from '@bk2/shared-models';

import { mapSectionValidations } from './map-section.validations';

describe('mapSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(mapSectionValidations({ ...MAP_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...MAP_SECTION_SHAPE, title: 123 } as unknown as MapSection;
    expect(mapSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags an out-of-range latitude', () => {
    const model = { ...MAP_SECTION_SHAPE, properties: { ...MAP_SECTION_SHAPE.properties, centerLatitude: 999 } } as unknown as MapSection;
    expect(mapSectionValidations(model).hasErrors('centerLatitude')).toBe(true);
  });
});
