import { IBAN_LENGTH } from '@okr/shared-constants';
import { enforce, omitWhen, test } from 'vest';

import { checkIban } from '@okr/shared-util-angular';
import { stringValidations } from '@okr/shared-util-core';

export function ibanValidations(fieldName: string, iban: unknown) {

  stringValidations(fieldName, iban, IBAN_LENGTH, IBAN_LENGTH);

  omitWhen(iban === '', () => {
    test(fieldName, '@validation.validIban', () => {
      enforce(checkIban(iban as string)).isTruthy();
    });
  });
}
