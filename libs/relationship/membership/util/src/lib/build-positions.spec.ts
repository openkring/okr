import { describe, expect, it } from 'vitest';
import type { FeeScheduleEntry, MembershipModel } from '@okr/shared-models';
import { buildPositions, getFeeTotal, rebatePosition, type FeeContext } from './build-positions';

const membership = (overrides: Partial<MembershipModel> = {}): MembershipModel => ({
  memberKey: 'p1', memberName1: 'Anna', memberName2: 'Muster', category: 'active',
  dateOfEntry: '20200101', memberBirthYear: '1980', tenants: ['scs'], ...overrides,
} as unknown as MembershipModel);

const ctx = (overrides: Partial<FeeContext> = {}): FeeContext => ({
  hasLocker: false, currentYear: 2026, categoryLists: {}, ...overrides,
});

const schedule = (positions: FeeScheduleEntry['positions']): FeeScheduleEntry =>
  ({ year: 2026, positions });

describe('buildPositions', () => {
  it('derives a category position from the category list price', () => {
    const result = buildPositions(membership(), schedule([
      { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
        source: 'category', categoryList: 'mcat_scs' },
    ]), ctx({ categoryLists: { mcat_scs: { active: 320 } } }));
    expect(result).toEqual([{ key: 'jb', usage: 'membershipFee', type: 'fix',
      label: 'Jahresbeitrag', amount: 320, accountKey: '', vatCodeKey: '' }]);
  });

  it('yields 0 when the category list has no price for the category', () => {
    const result = buildPositions(membership({ category: 'passive' } as Partial<MembershipModel>), schedule([
      { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
        source: 'category', categoryList: 'mcat_scs' },
    ]), ctx({ categoryLists: { mcat_scs: { active: 320 } } }));
    expect(result[0].amount).toBe(0);
  });

  it('charges a flag position only when the flag holds', () => {
    const rule = { key: 'locker', usage: 'lockerRental', type: 'fix', label: 'Kästchen',
      source: 'flag' as const, flag: 'hasLocker' as const, amount: 20 };
    expect(buildPositions(membership(), schedule([rule]), ctx({ hasLocker: true }))[0].amount).toBe(20);
    expect(buildPositions(membership(), schedule([rule]), ctx({ hasLocker: false }))[0].amount).toBe(0);
  });

  it('starts a manual position at its default', () => {
    const result = buildPositions(membership(), schedule([
      { key: 'skiff', usage: 'boatPlaceRental', type: 'fix', label: 'Skiff', source: 'manual' },
    ]), ctx());
    expect(result[0].amount).toBe(0);
  });

  it('charges newMemberOver25 for a member who joined this year aged over 25', () => {
    const result = buildPositions(membership({ dateOfEntry: '20260201', memberBirthYear: '1980' } as Partial<MembershipModel>),
      schedule([{ key: 'entryFee', usage: 'other', type: 'fix', label: 'Eintrittsgebühr',
        source: 'rule', rule: 'newMemberOver25', amount: 750 }]), ctx());
    expect(result[0].amount).toBe(750);
  });

  it('does not charge newMemberOver25 for a member who joined in an earlier year', () => {
    const result = buildPositions(membership({ dateOfEntry: '20200101', memberBirthYear: '1980' } as Partial<MembershipModel>),
      schedule([{ key: 'entryFee', usage: 'other', type: 'fix', label: 'Eintrittsgebühr',
        source: 'rule', rule: 'newMemberOver25', amount: 750 }]), ctx());
    expect(result[0].amount).toBe(0);
  });

  // An empty birth year is the safe direction: no charge, exactly as today.
  it('does not charge newMemberOver25 when the birth year is unknown', () => {
    const result = buildPositions(membership({ dateOfEntry: '20260201', memberBirthYear: '' } as Partial<MembershipModel>),
      schedule([{ key: 'entryFee', usage: 'other', type: 'fix', label: 'Eintrittsgebühr',
        source: 'rule', rule: 'newMemberOver25', amount: 750 }]), ctx());
    expect(result[0].amount).toBe(0);
  });
});

describe('buildPositions — scs 2026 regression', () => {
  // Reproduces the numbers the eight hardcoded columns produced, so the migration is provably
  // behaviour-preserving for everything except the entry fee (design §8.3).
  const SCS_2026: FeeScheduleEntry = { year: 2026, positions: [
    { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', source: 'category', categoryList: 'mcat_scs' },
    { key: 'srv', usage: 'srvFee', type: 'fix', label: 'SRV-Beitrag', source: 'category', categoryList: 'mcat_srv' },
    { key: 'locker', usage: 'lockerRental', type: 'fix', label: 'Kästchen', source: 'flag', flag: 'hasLocker', amount: 20 },
    { key: 'skiff', usage: 'boatPlaceRental', type: 'fix', label: 'Skiffplatz', source: 'manual' },
    { key: 'skiffInsurance', usage: 'insurance', type: 'fix', label: 'Skiffversicherung', source: 'manual' },
    { key: 'hallenTraining', usage: 'other', type: 'fix', label: 'Hallentraining', source: 'manual' },
  ] };

  it('reproduces an active member with a locker', () => {
    const positions = buildPositions(
      membership({ category: 'active' } as Partial<MembershipModel>), SCS_2026,
      ctx({ hasLocker: true, categoryLists: { mcat_scs: { active: 320 }, mcat_srv: {} } }));
    expect(getFeeTotal(positions)).toBe(340);
  });

  it('subtracts a rebate position from the total', () => {
    const positions = buildPositions(membership(), SCS_2026,
      ctx({ categoryLists: { mcat_scs: { active: 320 }, mcat_srv: {} } }));
    positions.push({ key: 'rebate', usage: 'other', type: 'rebate', label: 'Rabatt',
      amount: 50, accountKey: '', vatCodeKey: '' });
    expect(getFeeTotal(positions)).toBe(270);
  });
});

describe('rebatePosition', () => {
  it('builds a rebate position carrying the reason as its label', () => {
    expect(rebatePosition(50, 'edu')).toEqual({
      key: 'rebate', usage: 'other', type: 'rebate', label: 'edu',
      amount: 50, accountKey: '', vatCodeKey: '',
    });
  });

  it('falls back to "Rabatt" when no reason is set', () => {
    expect(rebatePosition(50, 'none')?.label).toBe('Rabatt');
    expect(rebatePosition(50, '')?.label).toBe('Rabatt');
  });

  it('keeps a reason even when the amount is zero', () => {
    expect(rebatePosition(0, 'family')).toMatchObject({ label: 'family', amount: 0 });
  });

  it('yields nothing when there is neither an amount nor a reason', () => {
    expect(rebatePosition(0, 'none')).toBeUndefined();
    expect(rebatePosition(0, '')).toBeUndefined();
  });

  it('subtracts from the total, like every rebate position', () => {
    const positions = [
      ...buildPositions(membership(), schedule([
        { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
          source: 'category', categoryList: 'mcat_scs' },
      ]), ctx({ categoryLists: { mcat_scs: { active: 320 } } })),
    ];
    const rebate = rebatePosition(50, 'edu');
    if (rebate) positions.push(rebate);
    expect(getFeeTotal(positions)).toBe(270);
  });
});
