import { IBAN_LENGTH } from '@bk2/shared-constants';
import { enforce, omitWhen, test } from 'vest';

import { checkIban } from '@bk2/shared-util-angular';
import { stringValidations } from '@bk2/shared-util-core';

export function ibanValidations(fieldName: string, iban: unknown) {

  stringValidations(fieldName, iban, IBAN_LENGTH, IBAN_LENGTH);

  omitWhen(iban === '', () => {
    test(fieldName, '@validIban', () => {
      enforce(checkIban(iban as string)).isTruthy();
    });
  });
}
