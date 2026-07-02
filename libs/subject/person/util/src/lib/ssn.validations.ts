import { enforce, omitWhen, test } from 'vest';

import { SSN_LENGTH } from '@okr/shared-constants';
import { checkAhv } from '@okr/shared-util-angular';
import { stringValidations } from '@okr/shared-util-core';

export function ssnValidations(fieldName: string, ssn: unknown ) {

  stringValidations(fieldName, ssn, SSN_LENGTH);

  omitWhen(ssn === '', () => {
    test(fieldName, '@validation.validSSN', () => {
      enforce(checkAhv(ssn as string)).isTruthy();
    });
  });
}

