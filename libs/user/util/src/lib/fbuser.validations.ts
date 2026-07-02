export const FIREBASE_USER_SHAPE: FirebaseUserModel = {
  uid: DEFAULT_ID,
  email: DEFAULT_EMAIL,
  displayName: DEFAULT_NAME,
  emailVerified: false,
  disabled: false,
  phone: DEFAULT_PHONE,
  photoUrl: DEFAULT_URL
};
import { only, staticSuite } from 'vest';

import { booleanValidations, stringValidations } from '@okr/shared-util-core';

import { FirebaseUserModel } from '@okr/shared-models';
import { DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_NAME, DEFAULT_PHONE, DEFAULT_URL, EMAIL_LENGTH, NAME_LENGTH, PHONE_LENGTH, URL_LENGTH } from '@okr/shared-constants';

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
