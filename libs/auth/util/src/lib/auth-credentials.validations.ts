import { EMAIL_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@bk2/shared-constants';
import { AuthCredentials } from '@bk2/shared-models';
import { stringValidations } from '@bk2/shared-util-core';
import { enforce, only, staticSuite, test } from 'vest';

export const authCredentialsValidations = staticSuite((model: AuthCredentials, field?: string) => {
  if (field) only(field);

  test('loginEmail', '@validation.loginEmailRequired', () => {
    enforce(model.loginEmail).isNotBlank();
  });
  stringValidations('loginEmail', model.loginEmail, EMAIL_LENGTH, 9, true);
  test('loginEmail', '@validation.emailMustContainAt', () => {
    enforce(model.loginEmail?.includes('@')).isTruthy();
  });
  test('loginEmail', '@validation.emailMustContainDot', () => {
    enforce(model.loginEmail?.includes('.')).isTruthy();
  });

  test('loginPassword', '@validation.loginPasswordRequired', () => {
    enforce(model.loginEmail).isNotBlank();
  });
  stringValidations('loginPassword', model.loginPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, true);
});


// for password reset, we use also AuthCredentials, but only the email is relevant, so we can reuse the same shape and validations, but only for the email field.
export const pwdresetValidations = staticSuite((model: AuthCredentials, field?: string) => {
  if (field) only(field);

  test('loginEmail', '@validation.loginEmailRequired', () => {
    enforce(model.loginEmail).isNotBlank();
  });
  stringValidations('loginEmail', model.loginEmail, EMAIL_LENGTH, 9, true);
  test('loginEmail', '@validation.emailMustContainAt', () => {
    enforce(model.loginEmail?.includes('@')).isTruthy();
  });
  test('loginEmail', '@validation.emailMustContainDot', () => {
    enforce(model.loginEmail?.includes('.')).isTruthy();
  });
});