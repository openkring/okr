import { ADVENT_SECTION_SHAPE, AdventSection } from '@okr/shared-models';

import { adventSectionValidations } from './advent-section.validations';
import { createAdventDoors } from './advent.util';

const section = (patch: Partial<AdventSection['properties']> = {}): AdventSection => ({
  ...ADVENT_SECTION_SHAPE,
  okey: 'k', name: 'n', title: 't', tenants: ['scs'],
  properties: { ...ADVENT_SECTION_SHAPE.properties, doors: createAdventDoors(1), ...patch },
});

describe('adventSectionValidations', () => {
  it('accepts a fresh section', () => {
    const result = adventSectionValidations(section());
    expect(result.getErrors('adventYear')).toEqual([]);
    expect(result.getErrors('adventDoors')).toEqual([]);
  });
  it('rejects a year out of range', () => {
    expect(adventSectionValidations(section({ year: 1999 })).getErrors('adventYear')).toEqual(['@cms/section/feature.validation.adventYearRange']);
  });
  it('rejects a door list that is not 25 long', () => {
    expect(adventSectionValidations(section({ doors: [] })).getErrors('adventDoors')).toEqual(['@cms/section/feature.validation.adventDoorCount']);
  });
});
