import { describe, expect, it } from 'vitest';
import { EXTENDED_ROLE_OPTIONS } from './user-roles.util';

describe('EXTENDED_ROLE_OPTIONS', () => {
  it('lists every role beyond plain membership, in select order', () => {
    expect(EXTENDED_ROLE_OPTIONS).toEqual([
      'privileged', 'contentAdmin', 'resourceAdmin', 'memberAdmin', 'eventAdmin', 'treasurer', 'admin',
      'groupAdmin', 'kiosk', 'tripAdmin', 'auditor', 'tester',
    ]);
  });

  it('leaves out the base roles', () => {
    for (const r of ['none', 'anonymous', 'public', 'registered'] as const) {
      expect(EXTENDED_ROLE_OPTIONS).not.toContain(r);
    }
  });
});
