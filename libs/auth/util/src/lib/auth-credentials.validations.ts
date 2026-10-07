import { EMAIL_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_SET_MIN_LENGTH } from '@okr/shared-constants';
import { AuthCredentials } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { isLoginIdInput, isValidLoginId, normalizeLoginIdInput } from '@okr/user-util';
import { enforce, staticSuite, test } from 'vest';

export type AuthCredentialsContext = 'login' | 'email' | 'password';

const emailTests = (model: AuthCredentials) => {
  test('loginEmail', '@validation.emailRequired', () => {
    enforce(model.loginEmail).isNotBlank();
  });
  if (isLoginIdInput(model.loginEmail ?? '')) {
    // a Benutzername (spec 1.71 §5.1) — same alphabet the functions assign
    test('loginEmail', '@validation.loginIdInvalid', () => {
      enforce(isValidLoginId(normalizeLoginIdInput(model.loginEmail ?? ''))).isTruthy();
    });
    return;
  }
  stringValidations('loginEmail', model.loginEmail, EMAIL_LENGTH, 9, true);
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

export const loginValidations = staticSuite((model: AuthCredentials) => {
  emailTests(model);
  passwordTests(model, PASSWORD_MIN_LENGTH);
});

export const emailValidations = staticSuite((model: AuthCredentials) => {
  emailTests(model);
});

/** Used when a NEW password is being chosen — see passwordTests for why the floor is higher. */
export const passwordValidations = staticSuite((model: AuthCredentials) => {
  passwordTests(model, PASSWORD_SET_MIN_LENGTH);
});

export const authCredentialsValidations = (model: AuthCredentials, context: AuthCredentialsContext = 'login'): ReturnType<typeof loginValidations> => {
  switch (context) {
    case 'email': return emailValidations(model);
    case 'password': return passwordValidations(model);
    default: return loginValidations(model);
  }
};
