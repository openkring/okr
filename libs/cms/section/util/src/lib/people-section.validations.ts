import { enforce, staticSuite, test } from 'vest';

import { NameDisplay, PEOPLE_BACKGROUNDS, PEOPLE_INFO_POSITIONS, PEOPLE_INFOS, PEOPLE_ORG_COLORS, PEOPLE_VIEWS, PeopleSection } from '@okr/shared-models';
import { categoryValidations, numberValidations, stringArrayValidations, stringsValidations } from '@okr/shared-util-core';

import { baseSectionValidations } from './base-section.validations';
import { HEX_COLOR_REGEX, IMG_RADIUS_REGEX, PEOPLE_MAX_BG_COLORS } from './people-section.util';

/** Vest key of a people config field — `avatar.<field>`, rendered inline by people-configuration. */
export function peopleField(field: string): string {
  return `avatar.${field}`;
}

/**
 * The view fields are optional on sections saved before 2026-11-10 (Firestore reads skip
 * model defaults), so each rule only runs once the field is present; the editor and the
 * section normalize missing values to the defaults.
 */
export const peopleSectionValidations = staticSuite((model: PeopleSection) => {
  baseSectionValidations(model);

  const avatar = model.properties?.avatar;
  if (!avatar) return;

  if (avatar.nameDisplay !== undefined) {
    categoryValidations(peopleField('nameDisplay'), avatar.nameDisplay, NameDisplay);
  }
  if (avatar.view !== undefined) {
    stringsValidations(peopleField('view'), avatar.view, PEOPLE_VIEWS);
  }
  if (avatar.perRow !== undefined) {
    numberValidations(peopleField('perRow'), avatar.perRow, true, 3, 10);
  }
  if (avatar.sliderRows !== undefined) {
    numberValidations(peopleField('sliderRows'), avatar.sliderRows, true, 1, 4);
  }
  if (avatar.imgWidth !== undefined) {
    numberValidations(peopleField('imgWidth'), avatar.imgWidth, true, 16, 1000);
  }
  if (avatar.imgHeight !== undefined) {
    numberValidations(peopleField('imgHeight'), avatar.imgHeight, true, 16, 1000);
  }
  if (avatar.imgRadius !== undefined) {
    test(peopleField('imgRadius'), 'invalidValue', () => {
      enforce(IMG_RADIUS_REGEX.test(String(avatar.imgRadius).trim())).isTruthy();
    });
  }
  if (avatar.facePad !== undefined) {
    numberValidations(peopleField('facePad'), avatar.facePad, false, 0, 2);
  }
  if (avatar.background !== undefined) {
    stringsValidations(peopleField('background'), avatar.background, PEOPLE_BACKGROUNDS);
  }
  if (avatar.bgOrgColor !== undefined) {
    stringsValidations(peopleField('bgOrgColor'), avatar.bgOrgColor, PEOPLE_ORG_COLORS);
  }
  if (avatar.bgColors !== undefined) {
    test(peopleField('bgColors'), 'tooMany', () => {
      enforce((avatar.bgColors ?? []).length).lessThanOrEquals(PEOPLE_MAX_BG_COLORS);
    });
    test(peopleField('bgColors'), 'invalidValue', () => {
      enforce((avatar.bgColors ?? []).every(c => HEX_COLOR_REGEX.test(c))).isTruthy();
    });
  }
  if (avatar.background === 'colors') {
    test(peopleField('bgColors'), 'required', () => {
      enforce((avatar.bgColors ?? []).length).greaterThan(0);
    });
  }
  if (avatar.info !== undefined) {
    stringArrayValidations(peopleField('info'), avatar.info, PEOPLE_INFOS);
  }
  if (avatar.infoPosition !== undefined) {
    stringsValidations(peopleField('infoPosition'), avatar.infoPosition, PEOPLE_INFO_POSITIONS);
  }
});
