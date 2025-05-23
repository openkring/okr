import { IBAN_LENGTH } from '@bk2/shared/config';
import { checkIban, stringValidations } from '@bk2/shared/util';
import { test, enforce, omitWhen } from 'vest';

export function ibanValidations(fieldName: string, iban: unknown) {

  stringValidations(fieldName, iban, IBAN_LENGTH, IBAN_LENGTH);

  omitWhen(iban === '', () => {
    test(fieldName, '@validIban', () => {
      enforce(checkIban(iban as string)).isTruthy();
    });
  });
}
