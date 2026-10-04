import { describe, expect, it } from 'vitest';

import { CategoryListModel, FeePositionRule } from '@okr/shared-models';

import { addPickedPosition, feeOptionToPosition, feePickOptions, toCategoryPriceLists } from './fee-position-pick.util';

const rule = (o: Partial<FeePositionRule> = {}): FeePositionRule =>
  ({ key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', source: 'category', accountKey: 'scs3000', ...o });

const lists = { mcat_scs: { active: 600, passive: 75 }, mcat_srv: { active: 75 } };
const ctx = { categoryLists: lists, defaultCategoryList: 'mcat_scs', receiverCategory: 'active' };

describe('feePickOptions', () => {
  it('prices a category position from the org default list', () => {
    expect(feePickOptions([rule()], ctx)[0].amount).toBe(600);
  });

  it('prefers the position override list (SRV fee)', () => {
    expect(feePickOptions([rule({ categoryList: 'mcat_srv' })], ctx)[0].amount).toBe(75);
  });

  it('yields 0 for a category without a price, without disabling it', () => {
    const [option] = feePickOptions([rule()], { ...ctx, receiverCategory: 'honorary' });
    expect(option.amount).toBe(0);
    expect(option.disabledReason).toBeUndefined();
  });

  it('disables a category position for a receiver who is not a member', () => {
    const [option] = feePickOptions([rule()], { ...ctx, receiverCategory: undefined });
    expect(option.disabledReason).toBe('notMember');
  });

  it('copies the fixed amount of flag, rule and manual positions without evaluating predicates', () => {
    const options = feePickOptions([
      rule({ source: 'flag', flag: 'hasLocker', amount: 120 }),
      rule({ source: 'rule', rule: 'newMemberOver25', amount: 50.5 }),
      rule({ source: 'manual', amount: 30 }),
    ], { ...ctx, receiverCategory: undefined });
    expect(options.map(o => o.amount)).toEqual([120, 50.5, 30]);
    expect(options.every(o => !o.disabledReason)).toBe(true);
  });

  it('marks a position without a revenue account', () => {
    expect(feePickOptions([rule({ accountKey: '' })], ctx)[0].missingAccount).toBe(true);
  });

  describe('pro rata (spec 1.79)', () => {
    const entering = { ...ctx, year: 2026, receiverMembership: { dateOfEntry: '20260915', dateOfExit: '99991231' } };

    it('bills the months of membership in the entry year, in whole francs', () => {
      const [option] = feePickOptions([rule({ proRata: true })], entering);
      expect(option.amount).toBe(200);
      expect(option.proRataMonths).toBe(4);
    });

    it('bills the full year for a member of the whole year', () => {
      const [option] = feePickOptions([rule({ proRata: true })],
        { ...entering, receiverMembership: { dateOfEntry: '20180101', dateOfExit: '99991231' } });
      expect(option.amount).toBe(600);
      expect(option.proRataMonths).toBeUndefined();
    });

    it('leaves a rule without proRata at its yearly price', () => {
      expect(feePickOptions([rule()], entering)[0].amount).toBe(600);
    });

    it('carries the months into the position description', () => {
      const [option] = feePickOptions([rule({ proRata: true })], entering);
      expect(feeOptionToPosition(option)).toEqual({
        name: 'Jahresbeitrag', amount: 200, accountKey: 'scs3000', description: 'pro rata verrechnet für 4 von 12 Monaten (voller Jahresbetrag CHF 600.00)',
      });
    });
  });
});

describe('feeOptionToPosition', () => {
  it('maps label, amount and account', () => {
    const [option] = feePickOptions([rule()], ctx);
    expect(feeOptionToPosition(option)).toEqual({ name: 'Jahresbeitrag', amount: 600, accountKey: 'scs3000' });
  });
});

describe('addPickedPosition', () => {
  const picked = { name: 'Jahresbeitrag', amount: 600, accountKey: 'scs3000' };

  it('replaces the blank starter row', () => {
    expect(addPickedPosition([{ name: '', amount: 0, accountKey: '' }], picked)).toEqual([picked]);
  });

  it('keeps an empty page-break line', () => {
    const pageBreak = { type: 'pageBreak', name: '', amount: 0, accountKey: '' };
    expect(addPickedPosition([pageBreak], picked)).toEqual([pageBreak, picked]);
  });

  it('appends after real positions', () => {
    const existing = { name: 'Schrank', amount: 120, accountKey: 'scs3010' };
    expect(addPickedPosition([existing], picked)).toEqual([existing, picked]);
  });
});

describe('toCategoryPriceLists', () => {
  it('flattens lists and counts a missing price as 0', () => {
    const list = { name: 'mcat_scs', items: [{ name: 'active', price: 600 }, { name: 'honorary' }] } as unknown as CategoryListModel;
    expect(toCategoryPriceLists([list])).toEqual({ mcat_scs: { active: 600, honorary: 0 } });
  });
});
