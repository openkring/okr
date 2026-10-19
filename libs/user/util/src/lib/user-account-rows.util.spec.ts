import { describe, expect, it } from 'vitest';
import { UserModel } from '@okr/shared-models';

import { buildUserAccountRows, filterUserAccountRows, UserAccountRow } from './user-account-rows.util';

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

describe('filterUserAccountRows', () => {
  const row = (kind: UserAccountRow['kind'], roles: UserAccountRow['roles'] = []): UserAccountRow => ({ kind, name: kind, roles });
  const rows = [
    row('normal', ['registered']), row('normal', ['registered', 'treasurer']), row('normal', ['admin']),
    row('loginWithoutUser'), row('userWithoutLogin', ['registered']), row('memberWithoutAccount'),
  ];

  it('defaults to normal rows only', () => {
    expect(filterUserAccountRows(rows, { problems: false }).map(r => r.kind)).toEqual(['normal', 'normal', 'normal']);
  });

  it('problems keeps exactly the three problem kinds', () => {
    expect(filterUserAccountRows(rows, { problems: true }).map(r => r.kind)).toEqual(['loginWithoutUser', 'userWithoutLogin', 'memberWithoutAccount']);
  });

  it("extendedRole 'any' keeps rows with a role besides registered", () => {
    const out = filterUserAccountRows(rows, { problems: false, extendedRole: 'any' });
    expect(out.map(r => r.roles)).toEqual([['registered', 'treasurer'], ['admin']]);
  });

  it('a specific extendedRole keeps only rows with that role', () => {
    const out = filterUserAccountRows(rows, { problems: false, extendedRole: 'treasurer' });
    expect(out).toHaveLength(1);
    expect(out[0].roles).toContain('treasurer');
  });
});
