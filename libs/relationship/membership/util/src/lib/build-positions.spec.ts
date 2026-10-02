import { describe, expect, it } from 'vitest';
import type { FeeScheduleEntry, MemberFeePosition, MembershipModel } from '@okr/shared-models';
import { applyProRata, buildPositions, getFeeTotal, proRataMonths, rebatePosition, type FeeContext } from './build-positions';

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

  it('falls back to the org default list when the position names none', () => {
    const result = buildPositions(membership(), schedule([
      { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', source: 'category' },
    ]), ctx({ categoryLists: { mcat_scs: { active: 320 } }, defaultCategoryList: 'mcat_scs' }));
    expect(result[0].amount).toBe(320);
  });

  it('prefers an explicit list over the org default (SRV override)', () => {
    const result = buildPositions(membership(), schedule([
      { key: 'srv', usage: 'srvFee', type: 'fix', label: 'SRV-Beitrag', source: 'category', categoryList: 'mcat_srv' },
    ]), ctx({ categoryLists: { mcat_scs: { active: 320 }, mcat_srv: { active: 75 } }, defaultCategoryList: 'mcat_scs' }));
    expect(result[0].amount).toBe(75);
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
  it('builds a rebate position carrying a readable label for the reason', () => {
    expect(rebatePosition(50, 'edu')).toEqual({
      key: 'rebate', usage: 'other', type: 'rebate', label: 'Ausbildungsrabatt',
      amount: 50, accountKey: '', vatCodeKey: '',
    });
    expect(rebatePosition(50, 'support')?.label).toBe('Skiff für Leistungssport');
    expect(rebatePosition(50, 'custom')?.label).toBe('Rabatt');
  });

  const fp = (key: string, usage: string, accountKey: string): MemberFeePosition =>
    ({ key, usage, type: 'fix', label: key, amount: 100, accountKey, vatCodeKey: '' }) as MemberFeePosition;

  it('reduces the membership fee account', () => {
    const positions = [fp('SRV', 'srvFee', 'acc-srv'), fp('JB', 'membershipFee', 'acc-jb')];
    expect(rebatePosition(50, 'edu', positions)?.accountKey).toBe('acc-jb');
    expect(rebatePosition(50, 'none', positions)?.accountKey).toBe('acc-jb');
  });

  it('reduces the skiff rental account for a support rebate', () => {
    const positions = [fp('JB', 'membershipFee', 'acc-jb'), fp('SLG', 'boatPlaceRental', 'acc-slg')];
    expect(rebatePosition(600, 'support', positions)?.accountKey).toBe('acc-slg');
  });

  it('falls back to the first position with an account', () => {
    const positions = [fp('X', 'other', ''), fp('SRV', 'srvFee', 'acc-srv')];
    expect(rebatePosition(50, 'support', positions)?.accountKey).toBe('acc-srv');
  });

  it('falls back to "Rabatt" when no reason is set', () => {
    expect(rebatePosition(50, 'none')?.label).toBe('Rabatt');
    expect(rebatePosition(50, '')?.label).toBe('Rabatt');
  });

  it('keeps a reason even when the amount is zero', () => {
    expect(rebatePosition(0, 'family')).toMatchObject({ label: 'Familienrabatt', amount: 0 });
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

describe('proRataMonths', () => {
  it('counts the entry month in the entry year', () => expect(proRataMonths('20260615', '', 2026)).toBe(7));
  it('counts the exit month in the exit year', () => expect(proRataMonths('20200101', '20260331', 2026)).toBe(3));
  it('counts entry to exit when both fall in the year', () => expect(proRataMonths('20260301', '20260831', 2026)).toBe(6));
  it('is a full year when neither falls in the year', () => expect(proRataMonths('20200101', '', 2026)).toBe(12));
  it('is 0 for an entry after the year', () => expect(proRataMonths('20270101', '', 2026)).toBe(0));
  it('is 0 for an exit before the year', () => expect(proRataMonths('20200101', '20251231', 2026)).toBe(0));
  it('treats empty or broken dates as a full year', () => expect(proRataMonths('', 'xx', 2026)).toBe(12));
});

describe('applyProRata', () => {
  const p = {
    key: 'JB', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', amount: 350, accountKey: 'a',
    vatCodeKey: '', yearlyAmount: 600, proRataMonths: 7, description: 'pro rata verrechnet, 7 Monate',
  } as MemberFeePosition;

  it('recomputes amount and text from the yearly amount', () => {
    expect(applyProRata(p, 3)).toMatchObject({ amount: 150, proRataMonths: 3, description: 'pro rata verrechnet, 3 Monate' });
  });

  it('restores the full year at 12 months and drops months and text (no undefined keys)', () => {
    const full = applyProRata(p, 12);
    expect(full.amount).toBe(600);
    expect(full.yearlyAmount).toBe(600);
    expect('proRataMonths' in full).toBe(false);
    expect('description' in full).toBe(false);
  });

  it('rounds to whole francs', () => expect(applyProRata({ ...p, yearlyAmount: 300 }, 7).amount).toBe(175));
  it('says Monat in the singular', () => expect(applyProRata(p, 1).description).toBe('pro rata verrechnet, 1 Monat'));
});

describe('buildPositions with proRata', () => {
  const jbRule = { key: 'JB', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
    source: 'category' as const, categoryList: 'mcat_scs', proRata: true };
  const prices = ctx({ currentYear: 2026, categoryLists: { mcat_scs: { active: 600 } } });

  it('bills a June entry at 7/12', () => {
    const [jb] = buildPositions(membership({ dateOfEntry: '20260615' }), schedule([jbRule]), prices);
    expect(jb).toMatchObject({ amount: 350, proRataMonths: 7, yearlyAmount: 600, description: 'pro rata verrechnet, 7 Monate' });
  });

  it('bills a March exit at 3/12', () => {
    const [jb] = buildPositions(membership({ dateOfExit: '20260331' } as Partial<MembershipModel>), schedule([jbRule]), prices);
    expect(jb.amount).toBe(150);
  });

  it('keeps yearlyAmount but no months or text for a full year', () => {
    const [jb] = buildPositions(membership(), schedule([jbRule]), prices);
    expect(jb.amount).toBe(600);
    expect(jb.yearlyAmount).toBe(600);
    expect('proRataMonths' in jb).toBe(false);
  });

  it('leaves a zero price at 0 without text', () => {
    const [jb] = buildPositions(membership({ dateOfEntry: '20260615', category: 'passive' } as Partial<MembershipModel>), schedule([jbRule]), prices);
    expect(jb.amount).toBe(0);
    expect('description' in jb).toBe(false);
  });

  it('leaves a rule without proRata untouched', () => {
    const [jb] = buildPositions(membership({ dateOfEntry: '20260615' }), schedule([{ ...jbRule, proRata: false }]), prices);
    expect(jb.amount).toBe(600);
    expect('yearlyAmount' in jb).toBe(false);
  });
});
