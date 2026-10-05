import { describe, expect, it } from 'vitest';
import { ApprovalModel } from '@okr/shared-models';
import { canDecideApproval, canWithdrawApproval, deciderName } from './approval.util';

const av = (key: string, name1 = 'A', name2 = 'B') => ({ key, name1, name2, modelType: 'person' as const, type: '', subType: '', label: '' });
const approval = (over: Partial<ApprovalModel> = {}): ApprovalModel =>
  ({ ...new ApprovalModel('scs'), approver: av('nadia', 'Nadia', 'Hungerbühler'), requestedBy: av('bruno'), ...over });

describe('canDecideApproval', () => {
  it('the approver may decide a pending approval', () => {
    expect(canDecideApproval(approval(), 'nadia', false)).toBe(true);
  });
  it('an admin may decide in the approver\'s place', () => {
    expect(canDecideApproval(approval(), 'someone', true)).toBe(true);
  });
  it('the requester, a task author or anyone else may not (Review Focus 4)', () => {
    expect(canDecideApproval(approval(), 'bruno', false)).toBe(false);
    expect(canDecideApproval(approval(), 'groupAdmin', false)).toBe(false);
    expect(canDecideApproval(approval(), '', false)).toBe(false);
  });
  it('nobody decides a decided approval', () => {
    expect(canDecideApproval(approval({ state: 'approved' }), 'nadia', true)).toBe(false);
  });
});

describe('canWithdrawApproval', () => {
  it('the requester may withdraw a pending approval', () => {
    expect(canWithdrawApproval(approval(), 'bruno', false)).toBe(true);
  });
  it('a stranger may not', () => {
    expect(canWithdrawApproval(approval(), 'x', false)).toBe(false);
  });
});

describe('deciderName', () => {
  it('names who decided', () => {
    expect(deciderName(approval({ state: 'approved', decidedBy: av('admin', 'Bruno', 'Kaiser') }))).toBe('Bruno Kaiser');
  });
  it('falls back to the approver on legacy approvals', () => {
    expect(deciderName(approval({ state: 'approved' }))).toBe('Nadia Hungerbühler');
  });
});
