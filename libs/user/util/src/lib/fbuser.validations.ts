import { DeepRequired } from 'ngx-vest-forms';

export const FirebaseUserShape: DeepRequired<FirebaseUserModel> = {
  uid: '',
  email: '',
  displayName: '',
  emailVerified: false,
  disabled: false,
  phone: '',
  photoUrl: ''
};
import { only, staticSuite } from 'vest';

import { booleanValidations, stringValidations } from '@bk2/shared-util-core';

import { FirebaseUserModel } from '@bk2/shared-models';
import { EMAIL_LENGTH, NAME_LENGTH, PHONE_LENGTH, URL_LENGTH } from '@bk2/shared-constants';

export const firebaseUserFormValidations = staticSuite((model: FirebaseUserModel, field?: string) => {
  only(field);

  stringValidations('uid', model.uid, NAME_LENGTH);
  stringValidations('email', model.email, EMAIL_LENGTH);
  stringValidations('displayName', model.displayName, NAME_LENGTH);
  booleanValidations('emailVerified', model.emailVerified);
  booleanValidations('disabled', model.disabled);
  stringValidations('phone', model.phone, PHONE_LENGTH);
  stringValidations('photoUrl', model.photoUrl, URL_LENGTH);
});
