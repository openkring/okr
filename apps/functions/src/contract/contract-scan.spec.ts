import { describe, expect, it } from 'vitest';
import { ContractModel } from '@okr/shared-models';
import { planContractScan, scanEventTarget } from './contract-scan';

const c = (p: Partial<ContractModel>) =>
  Object.assign(new ContractModel('t1'), { okey: 'k1', name: 'Darlehen A', contractType: 'loan', state: 'active' }, p);

describe('planContractScan', () => {
  it('nothing to do → empty patch and no events', () => {
    const x = c({ endDate: '20301231', nextDeadline: '20301231', nextDeadlineKind: 'end' });
    expect(planContractScan(x, '20270101')).toEqual({ patch: {}, events: [] });
  });
  it('emits contract.deadline with view-formatted date and marks windows', () => {
    const out = planContractScan(c({ endDate: '20271231', nextDeadline: '20271231', nextDeadlineKind: 'end' }), '20271002');
    expect(out.events).toEqual([{ event: 'contract.deadline', params: {
      kind: 'end', leadDays: '90', deadline: '31.12.2027', deadlineDate: '20271231', contractType: 'loan', contractName: 'Darlehen A' } }]);
    expect(out.patch.remindersSent).toEqual(['end:20271231:90']);
  });
  it('catches up after a missed day without duplicates', () => {
    const first = planContractScan(c({ endDate: '20271231' }), '20271003');   // missed 10-02, runs 10-03
    expect(first.events).toHaveLength(1);
    const second = planContractScan(c({ endDate: '20271231', remindersSent: first.patch.remindersSent as string[] }), '20271004');
    expect(second.events).toEqual([]);
  });
  it('renewal rolls endDate, emits renewed, then plans against the new cycle', () => {
    const out = planContractScan(c({ endDate: '20261231', autoRenewMonths: 12,
      notice: { ours: { duration: 3, unit: 'months' }, theirs: undefined, to: 'contractEnd' } }), '20270101');
    expect(out.patch.endDate).toBe('20271231');
    expect(out.events[0]).toEqual({ event: 'contract.renewed', params: { contractType: 'loan', contractName: 'Darlehen A' } });
    expect(out.patch.nextDeadline).toBe('20270930');
  });
  it('ended contract: state patched, no deadline events', () => {
    const out = planContractScan(c({ endDate: '20261231', nextDeadline: '20261231', nextDeadlineKind: 'end' }), '20270101');
    expect(out.patch.state).toBe('ended');
    expect(out.events.map((e) => e.event)).toEqual(['contract.ended']);
    expect(out.patch.nextDeadline).toBe('');
  });
  it('prunes past markers', () => {
    const out = planContractScan(c({ endDate: '20301231', remindersSent: ['rateFix:20261231:7'] }), '20270101');
    expect(out.patch.remindersSent).toEqual([]);
  });
});

describe('scanEventTarget', () => {
  const deadline = (kind: string, deadlineDate: string) => ({ event: 'contract.deadline' as const, params: { kind, deadlineDate, leadDays: '90' } });
  it('a deadline reminder gets a per-deadline relatedKey and links the contract', () => {
    expect(scanEventTarget('k1', deadline('notice', '20270930'))).toEqual({
      relatedKey: 'contract.k1.notice.20270930',
      params: { kind: 'notice', deadlineDate: '20270930', leadDays: '90', linkKey: 'contract.k1' },
    });
  });
  it('different deadlines of one contract never share a dedup key', () => {
    const a = scanEventTarget('k1', deadline('notice', '20270930')).relatedKey;
    const b = scanEventTarget('k1', deadline('rateFix', '20271231')).relatedKey;
    const c = scanEventTarget('k1', deadline('notice', '20280930')).relatedKey;
    expect(new Set([a, b, c]).size).toBe(3);
  });
  it('the relatedModelType segment stays "contract"', () => {
    expect(scanEventTarget('k1', deadline('end', '20271231')).relatedKey.split('.')[0]).toBe('contract');
  });
  it('ended / renewed keep the contract as relatedKey', () => {
    expect(scanEventTarget('k1', { event: 'contract.ended', params: { contractName: 'A' } })).toEqual({
      relatedKey: 'contract.k1', params: { contractName: 'A', linkKey: 'contract.k1' },
    });
  });
});
