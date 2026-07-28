import { enforce, omitWhen, test } from 'vest';

import { SSN_LENGTH } from '@okr/shared-constants';
import { checkAhv, isBlankAhv } from '@okr/shared-util-angular';
import { stringValidations } from '@okr/shared-util-core';

export function ssnValidations(fieldName: string, ssn: unknown ) {

  stringValidations(fieldName, ssn, SSN_LENGTH);

  // isBlankAhv, not `ssn === ''`: the AHV field is masked with fixed leading literals, so a
  // cleared field hands back the '756.' scaffolding instead of an empty string. Treating that
  // as an invalid number kept the form invalid and hid the change-confirmation bar — i.e. an
  // AHV number could be entered but never removed again.
  omitWhen(isBlankAhv(ssn as string), () => {
    test(fieldName, '@validation.validSSN', () => {
      enforce(checkAhv(ssn as string)).isTruthy();
    });
  });
}

