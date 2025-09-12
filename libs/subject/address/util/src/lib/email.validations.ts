import { enforce, omitWhen, test } from 'vest';
import 'vest/enforce/email';

import { LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { stringValidations } from '@bk2/shared-util-core';

export function emailValidations(fieldName: string, email: unknown) {

  stringValidations(fieldName, email, LONG_NAME_LENGTH);

  omitWhen(email === '', () => {
    test(fieldName, '@validEmailFormat', () => {
      enforce(email).isEmail();
    });
  });
}
