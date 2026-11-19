import { enforce, omitWhen, staticSuite, test } from 'vest';

import { CITY_LENGTH, NAME_LENGTH, NUMBER_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { isRenderableStoreDate, stringValidations } from '@okr/shared-util-core';

/** One swisstopo suggestion, as the `searchSwissAddress` callable returns it (mirrors the server type). */
export interface SwissAddressHit {
  egaid: string;
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  latitude: number;
  longitude: number;
  label: string;
}

/** An address typed by hand (not found in the register, or outside CH). Mirrors the server type. */
export interface ManualAddressInput {
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
}

/**
 * move: «Ich ziehe um» / «Wir ziehen um» / «Umzug erfassen» — a new row from a date.
 * correct: «Adresse korrigieren» — the same row relinked, dates unchanged.
 * edit-move: «Umzug bearbeiten» — an announced move with a new address and/or date.
 */
export type PostalMoveMode = 'move' | 'correct' | 'edit-move';

/** Form model of the move modal (spec 1.164 §6.2). */
export interface PostalMoveFormModel {
  countryCode: string;
  /** the swisstopo search text */
  query: string;
  /** the chosen suggestion; undefined while searching or when the address is typed by hand */
  hit: SwissAddressHit | undefined;
  manual: ManualAddressInput;
  /** c/o, apartment, floor */
  addressValue2: string;
  /** StoreDate; ignored in correct mode */
  validFrom: string;
}

export function newPostalMoveFormModel(validFrom: string, countryCode = 'CH'): PostalMoveFormModel {
  return {
    countryCode,
    query: '',
    hit: undefined,
    manual: { streetName: '', streetNumber: '', zipCode: '', city: '', countryCode },
    addressValue2: '',
    validFrom,
  };
}

const VPFX = '@subject/address/feature.move.validation.';

export const postalMoveValidations = staticSuite((model: PostalMoveFormModel, mode: PostalMoveMode) => {
  stringValidations('addressValue2', model.addressValue2, SHORT_NAME_LENGTH);

  omitWhen(mode === 'correct', () => {
    test('validFrom', VPFX + 'validFrom_required', () => {
      enforce(model.validFrom).isNotBlank();
    });
    omitWhen(!model.validFrom, () => {
      test('validFrom', VPFX + 'validFrom_invalid', () => {
        enforce(isRenderableStoreDate(model.validFrom)).isTruthy();
      });
    });
  });

  // either a register hit or a complete manual address
  omitWhen(!!model.hit, () => {
    stringValidations('manual.streetName', model.manual.streetName, NAME_LENGTH);
    stringValidations('manual.streetNumber', model.manual.streetNumber, NUMBER_LENGTH);
    stringValidations('manual.zipCode', model.manual.zipCode);
    stringValidations('manual.city', model.manual.city, CITY_LENGTH);
    test('manual.streetName', VPFX + 'street_required', () => {
      enforce(model.manual.streetName).isNotBlank();
    });
    test('manual.zipCode', VPFX + 'zip_required', () => {
      enforce(model.manual.zipCode).isNotBlank();
    });
    test('manual.city', VPFX + 'city_required', () => {
      enforce(model.manual.city).isNotBlank();
    });
    omitWhen(model.countryCode !== 'CH' || !model.manual.zipCode, () => {
      test('manual.zipCode', VPFX + 'zip_ch', () => {
        enforce(/^\d{4}$/.test(model.manual.zipCode.trim())).isTruthy();
      });
    });
  });
});
