import { describe, expect, it } from 'vitest';

import { AuthCredentials } from '@okr/shared-models';

import { authCredentialsValidations, loginValidations } from './auth-credentials.validations';

const creds = (loginEmail: string, loginPassword: string): AuthCredentials => ({ loginEmail, loginPassword });

describe('authCredentialsValidations', () => {
  describe('login context', () => {
    it('accepts a 6-character password', () => {
      // The floor here must NOT follow the set-password floor. Accounts created before it was
      // raised still hold 6-character passwords; validating the login field at 8 would refuse to
      // submit a correct password and lock those members out with a form error.
      const result = authCredentialsValidations(creds('anna@example.ch', 'abc123'), 'login');
      expect(result.getErrors('loginPassword')).toEqual([]);
      expect(result.isValid()).toBe(true);
    });

    it('rejects a 5-character password', () => {
      const result = authCredentialsValidations(creds('anna@example.ch', 'abc12'), 'login');
      expect(result.getErrors('loginPassword').length).toBeGreaterThan(0);
    });

    it('requires both an email and a password', () => {
      expect(authCredentialsValidations(creds('', 'abc123'), 'login').isValid()).toBe(false);
      expect(authCredentialsValidations(creds('anna@example.ch', ''), 'login').isValid()).toBe(false);
    });
  });

  describe('password context (setting a new one)', () => {
    it('rejects a 6-character password', () => {
      const result = authCredentialsValidations(creds('', 'abc123'), 'password');
      expect(result.getErrors('loginPassword').length).toBeGreaterThan(0);
      expect(result.isValid()).toBe(false);
    });

    it('accepts an 8-character password', () => {
      const result = authCredentialsValidations(creds('', 'abc12345'), 'password');
      expect(result.getErrors('loginPassword')).toEqual([]);
      expect(result.isValid()).toBe(true);
    });

    it('ignores the email, which the page fills in from the verified link', () => {
      expect(authCredentialsValidations(creds('', 'abc12345'), 'password').isValid()).toBe(true);
    });

    it('accepts the special characters the input mask used to swallow', () => {
      // PasswordMask dropped these as the user typed, so an iOS- or manager-generated password
      // arrived mangled with no message. Nothing may reject them now.
      const generated = 'brek-4mtoz#Qufpa~[]{}|^\\\'"<>/';
      const result = authCredentialsValidations(creds('', generated), 'password');
      expect(result.getErrors('loginPassword')).toEqual([]);
    });

    it('accepts a password longer than the old 24-character cap', () => {
      const long = 'x'.repeat(40);
      expect(authCredentialsValidations(creds('', long), 'password').isValid()).toBe(true);
    });
  });

  describe('email context (requesting a link)', () => {
    it('is valid on the address alone, with no password', () => {
      const result = authCredentialsValidations(creds('anna@example.ch', ''), 'email');
      expect(result.isValid()).toBe(true);
    });

    it('rejects an address with an @ but no dot', () => {
      expect(authCredentialsValidations(creds('anna@example', ''), 'email').isValid()).toBe(false);
    });

    // A bare word with no '@' now reads as a Benutzername candidate (spec 1.71 §5.1), not a
    // malformed email — see loginValidations 'login accepts a Benutzername' below. The old
    // "rejects an address without an @" case moved there.
  });
});

describe('login validations', () => {
  it('login accepts a Benutzername instead of an email', () => {
    const r = loginValidations({ loginEmail: 'max_mueller', loginPassword: 'secret1' } as AuthCredentials);
    expect(r.hasErrors('loginEmail')).toBe(false);
  });
  it('login rejects a Benutzername with forbidden characters', () => {
    const r = loginValidations({ loginEmail: 'max mueller!', loginPassword: 'secret1' } as AuthCredentials);
    expect(r.hasErrors('loginEmail')).toBe(true);
  });
  it('login still validates an email as before', () => {
    const r = loginValidations({ loginEmail: 'anna@gmail', loginPassword: 'secret1' } as AuthCredentials);
    expect(r.hasErrors('loginEmail')).toBe(true);
  });
});
