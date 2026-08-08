import { describe, expect, it } from 'vitest';
import { Roles } from '@okr/shared-models';
import { CountableUser, countBillableUsers } from './count.util';

function user(roles: Record<string, boolean>, extra: Partial<CountableUser> = {}): CountableUser {
  return { roles: roles as Roles, isArchived: false, disabled: false, ...extra };
}

describe('countBillableUsers (pricing §9.1)', () => {
  it('counts a plain member once', () => {
    expect(countBillableUsers([user({ registered: true })]))
      .toEqual({ totalUsers: 1, privilegedUsers: 0 });
  });

  it('counts each of the eight privileged roles as privileged', () => {
    const roles = ['privileged', 'admin', 'contentAdmin', 'resourceAdmin', 'memberAdmin',
      'eventAdmin', 'treasurer', 'groupAdmin'];
    const users = roles.map(r => user({ registered: true, [r]: true }));
    expect(countBillableUsers(users)).toEqual({ totalUsers: 8, privilegedUsers: 8 });
  });

  it('counts auditor once, not double', () => {
    expect(countBillableUsers([user({ auditor: true })]))
      .toEqual({ totalUsers: 1, privilegedUsers: 0 });
  });

  it('skips archived and disabled accounts', () => {
    const users = [
      user({ registered: true }, { isArchived: true }),
      user({ admin: true }, { disabled: true }),
      user({ registered: true }),
    ];
    expect(countBillableUsers(users)).toEqual({ totalUsers: 1, privilegedUsers: 0 });
  });

  it('does not bill kiosk, tester or a role-less account', () => {
    const users = [user({ kiosk: true }), user({ tester: true }), user({}),
      user({ kiosk: true, tester: true })];
    expect(countBillableUsers(users)).toEqual({ totalUsers: 0, privilegedUsers: 0 });
  });

  it('bills a kiosk account that also holds a real role', () => {
    expect(countBillableUsers([user({ kiosk: true, treasurer: true })]))
      .toEqual({ totalUsers: 1, privilegedUsers: 1 });
  });

  it('ignores roles explicitly set to false', () => {
    expect(countBillableUsers([user({ registered: true, admin: false })]))
      .toEqual({ totalUsers: 1, privilegedUsers: 0 });
  });

  it('reproduces §3\'s worked example: 20 members + 3 privileged → n = 26', () => {
    const users = [
      ...Array.from({ length: 20 }, () => user({ registered: true })),
      ...Array.from({ length: 3 }, () => user({ registered: true, admin: true })),
    ];
    const counts = countBillableUsers(users);
    expect(counts).toEqual({ totalUsers: 23, privilegedUsers: 3 });
    expect(counts.totalUsers + counts.privilegedUsers).toBe(26);
  });
});
