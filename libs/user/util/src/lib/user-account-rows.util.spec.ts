import { describe, expect, it } from 'vitest';
import { UserModel } from '@okr/shared-models';

import { buildUserAccountRows, filterUserAccountRows, searchUserAccountRows, UserAccountRow } from './user-account-rows.util';

function user(okey: string, tenant: string, extra: Partial<UserModel> = {}): UserModel {
  const u = new UserModel(tenant);
  u.okey = okey;
  u.loginEmail = `${okey}@x.ch`;
  u.firstName = 'Anna';
  u.lastName = okey;
  u.personKey = `p-${okey}`;
  return Object.assign(u, extra);
}

describe('buildUserAccountRows', () => {
  it('maps login + user in the own tenant to a normal row', () => {
    const rows = buildUserAccountRows([user('u1', 'scs', { roles: { admin: true, registered: true } })], [{ uid: 'u1', email: 'fb@x.ch' }], [], 'scs', false);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('normal');
    expect(rows[0].uid).toBe('u1');
    expect(rows[0].name).toBe('Anna u1');
    expect(rows[0].loginEmail).toBe('u1@x.ch');
    expect(rows[0].roles.sort()).toEqual(['admin', 'registered']);
  });

  it('skips a login whose user belongs to another tenant', () => {
    const rows = buildUserAccountRows([user('u1', 'other')], [{ uid: 'u1' }], [], 'scs', true);
    expect(rows).toEqual([]);
  });

  it('maps a user without login to userWithoutLogin', () => {
    const rows = buildUserAccountRows([user('u2', 'scs', { loginId: 'anna' })], [], [], 'scs', false);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('userWithoutLogin');
    expect(rows[0].loginId).toBe('anna');
    expect(rows[0].personKey).toBe('p-u2');
  });

  it('ignores a loginless user of another tenant', () => {
    expect(buildUserAccountRows([user('u2', 'other')], [], [], 'scs', true)).toEqual([]);
  });

  it('maps an active member without any account to memberWithoutAccount', () => {
    const rows = buildUserAccountRows([user('u1', 'scs')], [{ uid: 'u1' }], [{ personKey: 'p-u1', name: 'A' }, { personKey: 'p-9', name: 'Berta Muster' }], 'scs', false);
    expect(rows.map(r => r.kind)).toEqual(['normal', 'memberWithoutAccount']);
    expect(rows[1].personKey).toBe('p-9');
    expect(rows[1].name).toBe('Berta Muster');
    expect(rows[1].uid).toBeUndefined();
    expect(rows[1].roles).toEqual([]);
  });

  it('produces loginWithoutUser rows only for the operator', () => {
    const logins = [{ uid: 'ghost', email: 'ghost@x.ch' }];
    const op = buildUserAccountRows([], logins, [], 'bka', true);
    expect(op).toHaveLength(1);
    expect(op[0].kind).toBe('loginWithoutUser');
    expect(op[0].uid).toBe('ghost');
    expect(op[0].loginEmail).toBe('ghost@x.ch');
    expect(op[0].name).toBe('ghost@x.ch');
    expect(buildUserAccountRows([], logins, [], 'scs', false)).toEqual([]);
  });
});

describe('buildUserAccountRows with incomplete sources', () => {
  it('produces no problem rows when a source failed, but keeps the normal rows', () => {
    const users = [user('u1', 'scs'), user('u2', 'scs')];
    const rows = buildUserAccountRows(users, [{ uid: 'u1' }, { uid: 'ghost' }], [{ personKey: 'p-9', name: 'B' }], 'bka', true, false);
    expect(rows.map(r => r.kind)).toEqual([]);   // u1 is of tenant scs, not bka
    const own = buildUserAccountRows(users, [{ uid: 'u1' }, { uid: 'ghost' }], [{ personKey: 'p-9', name: 'B' }], 'scs', true, false);
    expect(own.map(r => r.kind)).toEqual(['normal']);
    expect(own[0].uid).toBe('u1');
  });

  it('with failed users no member is reported as without account', () => {
    expect(buildUserAccountRows([], [{ uid: 'u1' }], [{ personKey: 'p-1', name: 'A' }], 'scs', false, false)).toEqual([]);
  });

  // The operator's user list spans every tenant: a user elsewhere is no account HERE.
  it('flags a member whose person has a user only in another tenant', () => {
    const rows = buildUserAccountRows([user('u3', 'other')], [], [{ personKey: 'p-u3', name: 'C' }], 'scs', true);
    expect(rows).toEqual([{ kind: 'memberWithoutAccount', personKey: 'p-u3', name: 'C', roles: [] }]);
  });

  it('does not flag a member whose person has a user in this tenant (shared across tenants)', () => {
    const rows = buildUserAccountRows([user('u4', 'other', { tenants: ['other', 'scs'] })], [{ uid: 'u4' }], [{ personKey: 'p-u4', name: 'D' }], 'scs', true);
    expect(rows.map(r => r.kind)).toEqual(['normal']);
  });

  it('a user doc without tenants (legacy) accounts for nobody', () => {
    const rows = buildUserAccountRows([user('u5', 'scs', { tenants: undefined as unknown as string[] })], [], [{ personKey: 'p-u5', name: 'E' }], 'scs', true);
    expect(rows.map(r => r.kind)).toEqual(['memberWithoutAccount']);
  });
});

describe('searchUserAccountRows', () => {
  const a: UserAccountRow = { kind: 'normal', name: 'Anna Muster', loginEmail: 'anna@x.ch', roles: [], user: Object.assign(new UserModel('scs'), { index: 'anna muster', tags: 'vorstand,kasse' }) };
  const b: UserAccountRow = { kind: 'memberWithoutAccount', name: 'Berta Beispiel', roles: [] };
  it('matches name/email and tag; rows without a user have no tags', () => {
    expect(searchUserAccountRows([a, b], 'berta', '')).toEqual([b]);
    expect(searchUserAccountRows([a, b], 'anna@x', '')).toEqual([a]);
    expect(searchUserAccountRows([a, b], '', 'vorstand')).toEqual([a]);
    expect(searchUserAccountRows([a, b], '', '')).toEqual([a, b]);
  });
});

describe('filterUserAccountRows', () => {
  const row = (kind: UserAccountRow['kind'], roles: UserAccountRow['roles'] = []): UserAccountRow => ({ kind, name: kind, roles });
  const rows = [
    row('normal', ['registered']), row('normal', ['registered', 'treasurer']), row('normal', ['admin']),
    row('loginWithoutUser'), row('userWithoutLogin', ['registered']), row('memberWithoutAccount'),
  ];

  it('without a chip keeps every row, problems included', () => {
    expect(filterUserAccountRows(rows, {})).toEqual(rows);
    expect(filterUserAccountRows(rows, { problems: false, extendedRoles: false })).toEqual(rows);
  });

  it('problems keeps exactly the three problem kinds', () => {
    expect(filterUserAccountRows(rows, { problems: true }).map(r => r.kind)).toEqual(['loginWithoutUser', 'userWithoutLogin', 'memberWithoutAccount']);
  });

  it('extendedRoles keeps rows with a role besides registered', () => {
    const out = filterUserAccountRows(rows, { extendedRoles: true });
    expect(out.map(r => r.roles)).toEqual([['registered', 'treasurer'], ['admin']]);
  });

  it('problems and extendedRoles together intersect', () => {
    const withRole = { ...row('userWithoutLogin', ['treasurer']) };
    const out = filterUserAccountRows([...rows, withRole], { problems: true, extendedRoles: true });
    expect(out).toEqual([withRole]);
  });
});
