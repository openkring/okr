import { enforce, omitWhen, test } from 'vest';
import 'vest/enforce/email';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

export function emailValidations(fieldName: string, email: unknown) {

  stringValidations(fieldName, email, LONG_NAME_LENGTH);

  omitWhen(email === '', () => {
    test(fieldName, '@validEmailFormat', () => {
      enforce(email).isEmail();
    });
  });
}
