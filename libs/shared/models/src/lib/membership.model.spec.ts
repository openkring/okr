import { describe, expect, it } from 'vitest';
import { MembershipModel } from './membership.model';

describe('MembershipModel', () => {
  it('should create an instance with tenantId', () => {
    const model = new MembershipModel('tenant-123');
    expect(model).toBeInstanceOf(MembershipModel);
    expect(model.tenants).toEqual(['tenant-123']);
  });

  it('has memberBirthYear with empty default (spec 1.19: year-precision dob replica)', () => {
    const model = new MembershipModel('tenant-xyz');
    expect(model.memberBirthYear).toBe('');
  });
});
