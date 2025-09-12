import { enforce, omitWhen, test } from 'vest';

import { SSN_LENGTH } from '@bk2/shared-constants';
import { checkAhv } from '@bk2/shared-util-angular';
import { stringValidations } from '@bk2/shared-util-core';

export function ssnValidations(fieldName: string, ssn: unknown ) {

  stringValidations(fieldName, ssn, SSN_LENGTH);

  omitWhen(ssn === '', () => {
    test(fieldName, '@validSSN', () => {
      enforce(checkAhv(ssn as string)).isTruthy();
    });
  });
}

