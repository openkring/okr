import { describe, expect, it } from 'vitest';
import { UserModel } from '@okr/shared-models';

import { accountCheckFindings, actionGroup, actionsForRow, AccountCheckTexts, isAuthUserNotFound, userEditRequest } from './user-account-actions.util';
import { UserAccountRow } from './user-account-rows.util';

function user(okey: string, extra: Partial<UserModel> = {}): UserModel {
  const u = new UserModel('scs');
  u.okey = okey;
  u.loginEmail = `${okey}@x.ch`;
  u.personKey = `p-${okey}`;
  return Object.assign(u, extra);
}

const normal: UserAccountRow = { kind: 'normal', uid: 'u1', personKey: 'p1', loginEmail: 'anna@x.ch', loginId: '', name: 'Anna', user: user('u1'), roles: ['registered'] };

describe('actionsForRow', () => {
  it('offers the full account toolbox on a normal row', () => {
    expect(actionsForRow(normal, false)).toEqual([
      'user.edit', 'person.edit',
      'account.reset', 'account.password', 'account.loginid', 'fbuser.edit', 'account.passkeys',
      'account.check', 'account.impersonate', 'matrix.provision',
      'copy.email', 'copy.uid', 'copy.pkey',
      'user.delete', 'fbuser.delete',
    ]);
  });

  it('offers the email swap only to a Benutzername login (synthetic login email)', () => {
    const row = { ...normal, loginEmail: 'max_mueller@login.seeclub.org', loginId: 'max_mueller' };
    expect(actionsForRow(row, false)).toEqual([
      'user.edit', 'person.edit',
      'account.reset', 'account.password', 'account.loginid', 'account.swap', 'fbuser.edit', 'account.passkeys',
      'account.check', 'account.impersonate', 'matrix.provision',
      'copy.email', 'copy.uid', 'copy.pkey',
      'user.delete', 'fbuser.delete',
    ]);
  });

  it('drops the person actions and the copy of a missing value on a normal row without a person', () => {
    const row = { ...normal, personKey: undefined };
    expect(actionsForRow(row, false)).toEqual([
      'user.edit',
      'account.reset', 'account.password', 'account.loginid', 'fbuser.edit', 'account.passkeys',
      'account.impersonate',
      'copy.email', 'copy.uid',
      'user.delete', 'fbuser.delete',
    ]);
  });

  it('offers «Passkeys» on a normal row, grouped with the account actions, not on a user without a login', () => {
    const noLogin: UserAccountRow = { kind: 'userWithoutLogin', uid: 'u2', personKey: 'p2', name: 'B', user: user('u2'), roles: [] };
    expect(actionsForRow(normal, false)).toContain('account.passkeys');
    expect(actionsForRow(noLogin, false)).not.toContain('account.passkeys');
    expect(actionGroup('account.passkeys')).toBe('account');
  });

  it('a user without a login can be edited, opened or deleted', () => {
    const row: UserAccountRow = { kind: 'userWithoutLogin', uid: 'u2', personKey: 'p2', loginEmail: 'b@x.ch', name: 'B', user: user('u2'), roles: [] };
    expect(actionsForRow(row, false)).toEqual(['user.edit', 'person.edit', 'account.open', 'account.check', 'copy.email', 'copy.uid', 'copy.pkey', 'user.delete']);
  });

  it('a member without an account can get one', () => {
    const row: UserAccountRow = { kind: 'memberWithoutAccount', personKey: 'p3', name: 'C', roles: [] };
    expect(actionsForRow(row, false)).toEqual(['person.edit', 'account.open', 'account.check', 'copy.pkey']);
  });

  it('a tenant admin may delete the login of a normal row (server: mayDeleteAuthUser), last in the sheet', () => {
    const actions = actionsForRow(normal, false);
    expect(actions.slice(-2)).toEqual(['user.delete', 'fbuser.delete']);
  });

  it('offers «Berechtigung prüfen» on every row with a person, problem rows included', () => {
    const rows: UserAccountRow[] = [
      normal,
      { kind: 'userWithoutLogin', uid: 'u2', personKey: 'p2', name: 'B', user: user('u2'), roles: [] },
      { kind: 'memberWithoutAccount', personKey: 'p3', name: 'C', roles: [] },
    ];
    expect(rows.map(r => actionsForRow(r, false).includes('account.check'))).toEqual([true, true, true]);
    expect(actionsForRow({ ...normal, personKey: undefined }, false).includes('account.check')).toBe(false);
  });

  it('a login without a user is operator-only', () => {
    const row: UserAccountRow = { kind: 'loginWithoutUser', uid: 'u4', loginEmail: 'd@x.ch', name: 'd@x.ch', roles: [] };
    expect(actionsForRow(row, true)).toEqual(['copy.email', 'copy.uid', 'fbuser.delete']);
    expect(actionsForRow(row, false)).toEqual([]);
  });
});

describe('userEditRequest', () => {
  const users = [user('u1'), user('u2')];

  it('does nothing without an edit key', () => {
    expect(userEditRequest(undefined, users, true)).toEqual({ kind: 'none' });
    expect(userEditRequest('', users, true)).toEqual({ kind: 'none' });
  });

  it('waits while the users are loading', () => {
    expect(userEditRequest('u1', users, false)).toEqual({ kind: 'wait' });
  });

  it('opens the user with that key', () => {
    expect(userEditRequest('u2', users, true)).toEqual({ kind: 'open', user: users[1] });
  });

  it('reports an unknown key once the users are loaded', () => {
    expect(userEditRequest('nope', users, true)).toEqual({ kind: 'missing' });
  });
});

describe('accountCheckFindings', () => {
  const texts: AccountCheckTexts = {
    person: 'Person', email: 'E-Mail', noEmail: 'keine E-Mail', user: 'Benutzer', noUser: 'kein Benutzer',
    login: 'Login', noLogin: 'kein Login', linkPerson: 'Benutzer → Person', linkLogin: 'Login → Benutzer', ok: 'in Ordnung', roles: 'Rollen', archived: 'archiviert',
    addEmail: 'E-Mail erfassen', addUser: 'Konto eröffnen', addLogin: 'Login eröffnen',
  };

  it('lists person, user and login of a consistent account', () => {
    const u = user('u1', { personKey: 'p1', tenants: ['scs'], roles: { registered: true, admin: true } });
    expect(accountCheckFindings({ personKey: 'p1', personTenants: ['scs'], favEmail: 'a@x.ch', user: u, login: { uid: 'u1', email: 'u1@x.ch' } }, texts)).toEqual([
      { id: 'person', title: 'Person', detail: 'p1 · scs' },
      { id: 'email', title: 'E-Mail', detail: 'a@x.ch' },
      { id: 'user', title: 'Benutzer', detail: 'u1 · u1@x.ch · scs' },
      { id: 'roles', title: 'Rollen', detail: 'registered, admin' },
      { id: 'user-person', title: 'Benutzer → Person', detail: 'in Ordnung' },
      { id: 'login', title: 'Login', detail: 'u1 · u1@x.ch' },
      { id: 'login-user', title: 'Login → Benutzer', detail: 'in Ordnung' },
    ]);
  });

  it('names what is missing or does not match', () => {
    const u = user('u1', { personKey: 'other', tenants: ['scs'], roles: { registered: true }, isArchived: true });
    expect(accountCheckFindings({ personKey: 'p1', personTenants: ['scs'], favEmail: '', user: u, login: undefined }, texts)).toEqual([
      { id: 'person', title: 'Person', detail: 'p1 · scs' },
      { id: 'email', title: 'E-Mail', detail: 'keine E-Mail', actions: [{ id: 'email.add', label: 'E-Mail erfassen', icon: 'add-circle' }] },
      { id: 'user', title: 'Benutzer', detail: 'u1 · u1@x.ch · scs · archiviert' },
      { id: 'roles', title: 'Rollen', detail: 'registered' },
      { id: 'user-person', title: 'Benutzer → Person', detail: 'other ≠ p1' },
      { id: 'login', title: 'Login', detail: 'kein Login', actions: [{ id: 'login.add', label: 'Login eröffnen', icon: 'add-circle' }] },
    ]);
  });

  it('reports a missing user', () => {
    expect(accountCheckFindings({ personKey: 'p1', personTenants: [], favEmail: 'a@x.ch', user: undefined, login: undefined }, texts)).toEqual([
      { id: 'person', title: 'Person', detail: 'p1' },
      { id: 'email', title: 'E-Mail', detail: 'a@x.ch' },
      { id: 'user', title: 'Benutzer', detail: 'kein Benutzer', actions: [{ id: 'user.add', label: 'Konto eröffnen', icon: 'add-circle' }] },
      { id: 'login', title: 'Login', detail: 'kein Login' },
    ]);
  });

  it('offers the roles as editable chips when the role names are given', () => {
    const u = user('u1', { personKey: 'p1', tenants: ['scs'], roles: { registered: true, admin: true, treasurer: false } });
    const roles = accountCheckFindings({ personKey: 'p1', personTenants: ['scs'], favEmail: 'a@x.ch', user: u, login: { uid: 'u1' }, allRoles: 'registered,admin,treasurer' }, texts)
      .find(f => f.id === 'roles');
    expect(roles).toEqual({ id: 'roles', title: 'Rollen', chips: { name: 'role', value: 'registered,admin', all: 'registered,admin,treasurer' } });
  });
});

describe('isAuthUserNotFound', () => {
  it('recognises the tenant check and the Admin SDK lookup as not found', () => {
    expect(isAuthUserNotFound({ code: 'functions/not-found', message: 'Dieses Benutzerkonto gibt es nicht.' })).toBe(true);
    expect(isAuthUserNotFound({ code: 'functions/internal', message: 'Failed to get the firebase user: There is no user record corresponding to the provided identifier.' })).toBe(true);
  });

  it('treats every other failure as an error', () => {
    expect(isAuthUserNotFound({ code: 'functions/permission-denied', message: 'nope' })).toBe(false);
    expect(isAuthUserNotFound({ code: 'functions/internal', message: 'Failed to get the firebase user: quota' })).toBe(false);
    expect(isAuthUserNotFound(new Error('network'))).toBe(false);
    expect(isAuthUserNotFound(undefined)).toBe(false);
  });
});
