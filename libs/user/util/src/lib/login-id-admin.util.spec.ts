import { describe, expect, it } from 'vitest';

import { UserModel } from '@okr/shared-models';

import { findLoginEmailHolder, isMinorAge } from './login-id-admin.util';

function user(okey: string, loginEmail: string, tenants = ['scs']): UserModel {
  const u = new UserModel(tenants[0]);
  u.okey = okey;
  u.loginEmail = loginEmail;
  u.tenants = tenants;
  return u;
}

describe('findLoginEmailHolder', () => {
  const users = [
    user('child', 'Anna@Gmail.com'),
    user('newcomer', 'anna_mueller@login.seeclub.org'),
    user('other-tenant', 'anna@gmail.com', ['kring']),
  ];

  it('finds the holder case-insensitively', () => {
    expect(findLoginEmailHolder(users, ' anna@gmail.COM ', 'scs', 'newcomer')?.okey).toBe('child');
  });

  it('ignores holders of other tenants', () => {
    expect(findLoginEmailHolder(users, 'anna@gmail.com', 'kring', 'x')?.okey).toBe('other-tenant');
    expect(findLoginEmailHolder([users[2]], 'anna@gmail.com', 'scs')).toBeUndefined();
  });

  it('never returns the excluded account itself', () => {
    expect(findLoginEmailHolder(users, 'anna@gmail.com', 'scs', 'child')).toBeUndefined();
  });

  it('returns undefined for an empty email', () => {
    expect(findLoginEmailHolder(users, '', 'scs')).toBeUndefined();
    expect(findLoginEmailHolder(users, undefined, 'scs')).toBeUndefined();
  });
});

describe('isMinorAge', () => {
  it('is true under 18 only', () => {
    expect(isMinorAge(0)).toBe(true);
    expect(isMinorAge(17)).toBe(true);
    expect(isMinorAge(18)).toBe(false);
    expect(isMinorAge(45)).toBe(false);
  });

  it('treats an unknown age (-1) as not minor', () => {
    expect(isMinorAge(-1)).toBe(false);
  });
});
