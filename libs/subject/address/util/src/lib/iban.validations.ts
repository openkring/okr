import { IBAN_LENGTH } from '@bk2/shared/constants';
import { stringValidations } from '@bk2/shared/util-core';
import { checkIban } from '@bk2/shared/util-angular';
import { test, enforce, omitWhen } from 'vest';

export function ibanValidations(fieldName: string, iban: unknown) {

  stringValidations(fieldName, iban, IBAN_LENGTH, IBAN_LENGTH);

  omitWhen(iban === '', () => {
    test(fieldName, '@validIban', () => {
      enforce(checkIban(iban as string)).isTruthy();
    });
  });
}
