import { IBAN_INPUT_LENGTH } from '@okr/shared-constants';
import { enforce, omitWhen, test } from 'vest';

import { checkIban } from '@okr/shared-util-angular';
import { stringValidations } from '@okr/shared-util-core';

export function ibanValidations(fieldName: string, iban: unknown) {

  // not IBAN_LENGTH: that is the Swiss friendly format, and a foreign IBAN is longer (DE: 27)
  stringValidations(fieldName, iban, IBAN_INPUT_LENGTH);

  omitWhen(iban === '', () => {
    test(fieldName, '@validation.validIban', () => {
      enforce(checkIban(iban as string)).isTruthy();
    });
  });
}
