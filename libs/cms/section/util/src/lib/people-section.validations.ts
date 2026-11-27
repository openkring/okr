import { enforce, staticSuite, test } from 'vest';

import { NameDisplay, PEOPLE_FILLS, PEOPLE_SHAPES, PEOPLE_SIZES, PEOPLE_TEXT_POSITIONS, PEOPLE_WIDTHS, PEOPLE_INFOS, PeopleSection } from '@okr/shared-models';
import { categoryValidations, stringArrayValidations, stringsValidations } from '@okr/shared-util-core';

import { baseSectionValidations } from './base-section.validations';

/** Vest key of a people config field — `avatar.<field>`, rendered inline by people-configuration. */
export function peopleField(field: string): string {
  return `avatar.${field}`;
}

/**
 * The look fields are optional on sections saved before 1.181 (the look is then derived from the old fields), so
 * each rule only runs once the field is present.
 */
export const peopleSectionValidations = staticSuite((model: PeopleSection) => {
  baseSectionValidations(model);

  const props = model.properties;
  const avatar = props?.avatar;

  for (const field of ['hiddenKeys', 'orderKeys'] as const) {
    const value = props?.[field];
    if (value !== undefined) {
      test(field, 'invalidValue', () => {
        enforce(Array.isArray(value) && value.every((k) => typeof k === 'string')).isTruthy();
      });
    }
  }

  if (!avatar) return;

  if (avatar.nameDisplay !== undefined) {
    categoryValidations(peopleField('nameDisplay'), avatar.nameDisplay, NameDisplay);
  }
  if (avatar.size !== undefined) {
    stringsValidations(peopleField('size'), avatar.size, PEOPLE_SIZES);
  }
  if (avatar.shape !== undefined) {
    stringsValidations(peopleField('shape'), avatar.shape, PEOPLE_SHAPES);
  }
  if (avatar.fill !== undefined) {
    stringsValidations(peopleField('fill'), avatar.fill, PEOPLE_FILLS);
  }
  if (avatar.textPosition !== undefined) {
    stringsValidations(peopleField('textPosition'), avatar.textPosition, PEOPLE_TEXT_POSITIONS);
  }
  if (avatar.info !== undefined) {
    stringArrayValidations(peopleField('info'), avatar.info, PEOPLE_INFOS);
  }
  if (avatar.width !== undefined) {
    stringsValidations(peopleField('width'), avatar.width, PEOPLE_WIDTHS);
  }
});
