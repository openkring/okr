import { describe, expect, it } from 'vitest';
import { decideAccountAction, MembershipDoc, relLogAbbrs, shiftDaysBack } from './account-sync.decide';

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

  it('is none when the membership is superseded by a category change', () => {
    const superseded = active({ dateOfExit: '20260811', relIsLast: false });
    expect(decideAccountAction(active(), superseded, TENANT, TODAY)).toBe('none');
  });

  it('still closes a real exit (relIsLast stays true)', () => {
    const ended = active({ dateOfExit: '20260811', relIsLast: true });
    expect(decideAccountAction(active(), ended, TENANT, TODAY)).toBe('close');
  });

  it('is none when both sides are inactive', () => {
    const ended = active({ dateOfExit: '20250101' });
    expect(decideAccountAction(ended, ended, TENANT, TODAY)).toBe('none');
  });
});

describe('relLogAbbrs', () => {
  it('reads the whole history, oldest first', () => {
    expect(relLogAbbrs({ ...active(), relLog: '20190101:A,20260814:P' })).toEqual(['A', 'P']);
  });

  it('a single entry means an entry, not a category change', () => {
    expect(relLogAbbrs({ ...active(), relLog: '20260814:A1' })).toEqual(['A1']);
  });

  it('tolerates a missing or malformed relLog', () => {
    expect(relLogAbbrs(active())).toEqual([]);
    expect(relLogAbbrs({ ...active(), relLog: '20260814' })).toEqual([]);
  });
});

describe('shiftDaysBack', () => {
  it('stays inside the month', () => {
    expect(shiftDaysBack('20260812', 7)).toBe('20260805');
  });

  it('crosses a month boundary', () => {
    expect(shiftDaysBack('20260803', 7)).toBe('20260727');
  });

  it('crosses a year boundary', () => {
    expect(shiftDaysBack('20260102', 7)).toBe('20251226');
  });

  it('handles a leap day', () => {
    expect(shiftDaysBack('20280301', 1)).toBe('20280229');
  });

  it('pads single-digit months and days', () => {
    expect(shiftDaysBack('20260908', 7)).toBe('20260901');
  });
});
