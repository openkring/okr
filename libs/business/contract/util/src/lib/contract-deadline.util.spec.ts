import { describe, expect, it } from 'vitest';
import { ContractModel } from '@okr/shared-models';
import {
  anchorTo, computeEffectiveEndDate, computeNextDeadline, contractDeadlines, currentCycleEnd, earliestTerminationDate,
} from './contract-deadline.util';

function contract(patch: Partial<ContractModel>): ContractModel {
  return Object.assign(new ContractModel('t1'), { state: 'active' }, patch);
}
const months = (duration: number) => ({ duration, unit: 'months' as const });

describe('anchorTo', () => {
  it.each([
    ['20270115', 'monthEnd', '20270131'],
    ['20280210', 'monthEnd', '20280229'],   // leap year
    ['20270210', 'monthEnd', '20270228'],
    ['20270501', 'quarterEnd', '20270630'],
    ['20271001', 'quarterEnd', '20271231'],
    ['20270315', 'yearEnd', '20271231'],
    ['20270315', 'anytime', '20270315'],
    ['20270315', 'contractEnd', '20270315'],
  ] as const)('%s → %s = %s', (d, to, exp) => expect(anchorTo(d, to)).toBe(exp));
});

describe('contractDeadlines', () => {
  it('fixed term without renewal → end deadline', () => {
    expect(contractDeadlines(contract({ endDate: '20271231' }), '20270101'))
      .toEqual([{ kind: 'end', date: '20271231' }]);
  });
  it('fixed term with renewal → notice deadline = end − ours (3 Monate auf Jahresende)', () => {
    const c = contract({ endDate: '20271231', autoRenewMonths: 12, notice: { ours: months(3), theirs: months(6), to: 'yearEnd' } });
    expect(contractDeadlines(c, '20270101')).toEqual([{ kind: 'notice', date: '20270930' }]);
  });
  it('renewal: notice day passed → next cycle', () => {
    const c = contract({ endDate: '20271231', autoRenewMonths: 12, notice: { ours: months(3), theirs: undefined, to: 'yearEnd' } });
    expect(contractDeadlines(c, '20271001')).toEqual([{ kind: 'notice', date: '20280930' }]);
  });
  it('31.01. minus one month clamps to month end', () => {
    const c = contract({ endDate: '20280331', autoRenewMonths: 1, notice: { ours: months(1), theirs: undefined, to: 'monthEnd' } });
    expect(contractDeadlines(c, '20280201')).toEqual([{ kind: 'notice', date: '20280229' }]);
  });
  it('open-ended → no notice deadline', () => {
    const c = contract({ endDate: '', notice: { ours: months(3), theirs: undefined, to: 'monthEnd' } });
    expect(contractDeadlines(c, '20270101')).toEqual([]);
  });
  it('notice given → end = effectiveEndDate', () => {
    const c = contract({ state: 'noticeGiven', endDate: '', effectiveEndDate: '20270630' });
    expect(contractDeadlines(c, '20270101')).toEqual([{ kind: 'end', date: '20270630' }]);
  });
  it('rate fixing on a loan, sorted with end', () => {
    const c = contract({ endDate: '20301231', loan: { rateFixedUntil: '20280331' } as ContractModel['loan'] });
    expect(contractDeadlines(c, '20270101')).toEqual([
      { kind: 'rateFix', date: '20280331' }, { kind: 'end', date: '20301231' },
    ]);
  });
  it('draft / negotiating / ended / archived → none', () => {
    for (const patch of [{ state: 'draft' }, { state: 'negotiating' }, { state: 'ended' }, { isArchived: true }] as Partial<ContractModel>[]) {
      expect(contractDeadlines(contract({ endDate: '20271231', ...patch }), '20270101')).toEqual([]);
    }
  });
  it('past dates are not deadlines', () => {
    expect(contractDeadlines(contract({ endDate: '20261231' }), '20270101')).toEqual([]);
  });
});

describe('computeNextDeadline', () => {
  it('earliest wins', () => {
    const c = contract({ endDate: '20301231', loan: { rateFixedUntil: '20280331' } as ContractModel['loan'] });
    expect(computeNextDeadline(c, '20270101')).toEqual({ date: '20280331', kind: 'rateFix' });
  });
  it('none → empty', () => {
    expect(computeNextDeadline(contract({}), '20270101')).toEqual({ date: '', kind: '' });
  });
});

describe('currentCycleEnd', () => {
  it('rolls across years until the notice day is ahead', () => {
    const c = contract({ endDate: '20251231', autoRenewMonths: 12, notice: { ours: months(3), theirs: undefined, to: 'yearEnd' } });
    expect(currentCycleEnd(c, '20271015')).toBe('20281231');
  });
});

describe('earliestTerminationDate', () => {
  it('open-ended, 3 Monate auf Quartalsende', () => {
    const c = contract({ notice: { ours: months(3), theirs: undefined, to: 'quarterEnd' } });
    expect(earliestTerminationDate(c, '20270115')).toBe('20270630');
  });
});

describe('computeEffectiveEndDate', () => {
  const partner = contract({
    endDate: '20271231', autoRenewMonths: 12,
    notice: { ours: months(6), theirs: months(3), to: 'contractEnd' },
  });
  it('partner gives 3 months notice in time → current end', () => {
    expect(computeEffectiveEndDate(partner, '20270915', 'them')).toBe('20271231');
  });
  it('we give 6 months notice too late → next cycle end', () => {
    expect(computeEffectiveEndDate(partner, '20270915', 'us')).toBe('20281231');
  });
  it('open-ended, anchored and not capped', () => {
    const c = contract({ notice: { ours: months(1), theirs: undefined, to: 'monthEnd' } });
    expect(computeEffectiveEndDate(c, '20270110', 'us')).toBe('20270228');
  });
  it('fixed term without renewal is capped at endDate', () => {
    const c = contract({ endDate: '20270331', notice: { ours: months(3), theirs: undefined, to: 'monthEnd' } });
    expect(computeEffectiveEndDate(c, '20270210', 'us')).toBe('20270331');
  });
});
