import { describe, expect, it } from 'vitest';

import { hasAdminRole } from './resolve-admin';

describe('hasAdminRole', () => {
  it('accepts the admin custom claim', () => {
    expect(hasAdminRole({ admin: true }, undefined)).toBe(true);
  });

  it('accepts the contentAdmin custom claim', () => {
    expect(hasAdminRole({ contentAdmin: true }, undefined)).toBe(true);
  });

  it('accepts admin from the Firestore user roles when no claim is set', () => {
    expect(hasAdminRole({}, { admin: true })).toBe(true);
  });

  it('accepts contentAdmin from the Firestore user roles', () => {
    expect(hasAdminRole(undefined, { contentAdmin: true })).toBe(true);
  });

  it('rejects a user with neither claims nor admin roles', () => {
    expect(hasAdminRole({ tenantId: 'scs' }, { registered: true, privileged: true })).toBe(false);
  });

  it('rejects when both sides are missing', () => {
    expect(hasAdminRole(undefined, undefined)).toBe(false);
  });

  it('does not accept truthy non-boolean values', () => {
    expect(hasAdminRole({ admin: 'true' }, { admin: 1 })).toBe(false);
  });
});
