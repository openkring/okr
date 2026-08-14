import { describe, expect, it } from 'vitest';

import { GroupModel, OrgModel, PersonModel } from '@okr/shared-models';

import { convertMemberAndOrgToMembership } from './membership.util';
import { membershipValidations } from './membership.validations';

function newPerson(): PersonModel {
  const p = new PersonModel('scs');
  p.okey = 'p1'; p.firstName = 'Anna'; p.lastName = 'Muster';
  return p;
}

describe('membershipValidations', () => {
  it('accepts a fresh group membership (open-ended dateOfExit)', () => {
    const g = new GroupModel('scs'); g.okey = 'g1'; g.name = 'Vorstand';
    const membership = convertMemberAndOrgToMembership(newPerson(), 'person', g, 'group', 'scs');
    expect(membership.dateOfExit).toBe('99991231'); // END_FUTURE_DATE_STR sentinel
    expect(membershipValidations(membership, 'scs', '').isValid()).toBe(true);
  });

  it('accepts a fresh org membership', () => {
    const o = new OrgModel('scs'); o.okey = 'o1'; o.name = 'Seeclub';
    const membership = convertMemberAndOrgToMembership(newPerson(), 'person', o, 'org', 'scs');
    expect(membershipValidations(membership, 'scs', '').isValid()).toBe(true);
  });

  it('accepts a membership built from a legacy person doc missing optional fields', () => {
    // Firestore returns the raw doc — favZipCode/bexioId/gender may be absent entirely
    const legacy = { okey: 'p2', firstName: 'Beat', lastName: 'Alt' } as unknown as PersonModel;
    const g = new GroupModel('scs'); g.okey = 'g1'; g.name = 'Vorstand';
    const membership = convertMemberAndOrgToMembership(legacy, 'person', g, 'group', 'scs');
    expect(membershipValidations(membership, 'scs', '').isValid()).toBe(true);
  });

  it('still rejects a malformed dateOfExit', () => {
    const o = new OrgModel('scs'); o.okey = 'o1'; o.name = 'Seeclub';
    const membership = convertMemberAndOrgToMembership(newPerson(), 'person', o, 'org', 'scs');
    membership.dateOfExit = '20261332';
    expect(membershipValidations(membership, 'scs', '').isValid()).toBe(false);
  });
});
