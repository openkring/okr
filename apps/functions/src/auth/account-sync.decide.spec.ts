import { describe, expect, it } from 'vitest';
import { decideAccountAction, MembershipDoc } from './account-sync.decide';

const TENANT = 'scs';
const TODAY = '20260812';

/** An active person↔default-org membership. */
function active(overrides: Partial<MembershipDoc> = {}): MembershipDoc {
  return {
    memberKey: 'p1',
    memberModelType: 'person',
    orgKey: TENANT,
    orgModelType: 'org',
    dateOfExit: '99991231',
    isArchived: false,
    ...overrides,
  };
}

describe('decideAccountAction', () => {
  it('opens when a membership is created active', () => {
    expect(decideAccountAction(undefined, active(), TENANT, TODAY)).toBe('open');
  });

  it('closes when the membership document is deleted', () => {
    expect(decideAccountAction(active(), undefined, TENANT, TODAY)).toBe('close');
  });

  it('closes when a past exit date is set', () => {
    expect(decideAccountAction(active(), active({ dateOfExit: '20260801' }), TENANT, TODAY)).toBe('close');
  });

  it('does NOT close on a future exit date', () => {
    expect(decideAccountAction(active(), active({ dateOfExit: '20261231' }), TENANT, TODAY)).toBe('none');
  });

  it('closes when the membership is archived', () => {
    expect(decideAccountAction(active(), active({ isArchived: true }), TENANT, TODAY)).toBe('close');
  });

  it('reopens when an archived membership is un-archived', () => {
    expect(decideAccountAction(active({ isArchived: true }), active(), TENANT, TODAY)).toBe('open');
  });

  it('ignores group memberships', () => {
    const g = active({ orgModelType: 'group', orgKey: 'rowing' });
    expect(decideAccountAction(undefined, g, TENANT, TODAY)).toBe('none');
  });

  it('ignores a non-default org', () => {
    const other = active({ orgKey: 'someOtherOrg' });
    expect(decideAccountAction(undefined, other, TENANT, TODAY)).toBe('none');
  });

  it('ignores org and group members', () => {
    expect(decideAccountAction(undefined, active({ memberModelType: 'org' }), TENANT, TODAY)).toBe('none');
    expect(decideAccountAction(undefined, active({ memberModelType: 'group' }), TENANT, TODAY)).toBe('none');
  });

  it('is none for an unrelated field update', () => {
    expect(decideAccountAction(active(), active({ memberKey: 'p1' }), TENANT, TODAY)).toBe('none');
  });

  it('is none when both sides are inactive', () => {
    const ended = active({ dateOfExit: '20250101' });
    expect(decideAccountAction(ended, ended, TENANT, TODAY)).toBe('none');
  });
});
