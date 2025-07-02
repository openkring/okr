import { SSN_LENGTH } from '@bk2/shared/constants';
import { stringValidations } from '@bk2/shared/util-core';
import { checkAhv } from '@bk2/shared/util-angular';
import { test, enforce, omitWhen } from 'vest';

export function ssnValidations(fieldName: string, ssn: unknown ) {

  stringValidations(fieldName, ssn, SSN_LENGTH);

  omitWhen(ssn === '', () => {
    test(fieldName, '@validSSN', () => {
      enforce(checkAhv(ssn as string)).isTruthy();
    });
  });
}

