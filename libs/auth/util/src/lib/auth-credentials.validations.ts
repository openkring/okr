import { EMAIL_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_SET_MIN_LENGTH } from '@okr/shared-constants';
import { AuthCredentials } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { enforce, only, staticSuite, test } from 'vest';

export type AuthCredentialsContext = 'login' | 'email' | 'password';

const emailTests = (model: AuthCredentials) => {
  test('loginEmail', '@validation.emailRequired', () => {
    enforce(model.loginEmail).isNotBlank();
  });
  stringValidations('loginEmail', model.loginEmail, EMAIL_LENGTH, 9, true);
  test('loginEmail', '@validation.emailMustContainAt', () => {
    enforce(model.loginEmail?.includes('@')).isTruthy();
  });
  test('loginEmail', '@validation.emailMustContainDot', () => {
    enforce(model.loginEmail?.includes('.')).isTruthy();
  });
};

/**
 * The floor differs by context on purpose. Setting a password is the moment we can ask for a
 * better one (PASSWORD_SET_MIN_LENGTH), but LOGGING IN must keep accepting what members already
 * have: accounts predating the raise still hold 6-character passwords, and validating the login
 * field against the higher floor would refuse to even submit a correct password.
 */
const passwordTests = (model: AuthCredentials, minLength: number) => {
  test('loginPassword', '@validation.passwordRequired', () => {
    enforce(model.loginPassword).isNotBlank();
  });
  stringValidations('loginPassword', model.loginPassword, PASSWORD_MAX_LENGTH, minLength, true);
};

export const loginValidations = staticSuite((model: AuthCredentials, field?: string) => {
  if (field) only(field);
  emailTests(model);
  passwordTests(model, PASSWORD_MIN_LENGTH);
});

export const emailValidations = staticSuite((model: AuthCredentials, field?: string) => {
  if (field) only(field);
  emailTests(model);
});

/** Used when a NEW password is being chosen — see passwordTests for why the floor is higher. */
export const passwordValidations = staticSuite((model: AuthCredentials, field?: string) => {
  if (field) only(field);
  passwordTests(model, PASSWORD_SET_MIN_LENGTH);
});

export const authCredentialsValidations = (model: AuthCredentials, field?: string, context: AuthCredentialsContext = 'login'): ReturnType<typeof loginValidations> => {
  switch (context) {
    case 'email': return emailValidations(model, field);
    case 'password': return passwordValidations(model, field);
    default: return loginValidations(model, field);
  }
};
