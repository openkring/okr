import { describe, expect, it } from 'vitest';
import { canReadBillsForApproval } from './bill-approval-access';

const resp = (o = {}) => ({ responsibleAvatar: { key: 'p1' }, validFrom: '', validTo: '99991231', ...o }) as never;
const ask = (o: object) => canReadBillsForApproval({ isTreasurer: false, personKey: 'p1', responsibilities: [resp()], today: '20261010', ...o });

describe('canReadBillsForApproval', () => {
  it('lets a treasurer read', () => expect(ask({ isTreasurer: true, personKey: '', responsibilities: [] })).toBe(true));
  it('lets the current approver read', () => expect(ask({})).toBe(true));
  it('refuses somebody else', () => expect(ask({ personKey: 'p2' })).toBe(false));
  it('refuses an expired approver', () => expect(ask({ responsibilities: [resp({ validTo: '20261009' })] })).toBe(false));
  it('lets an active delegate read', () => expect(ask({ personKey: 'p9',
    responsibilities: [resp({ delegateAvatar: { key: 'p9' }, delegateValidFrom: '20261001', delegateValidTo: '20261031' })] })).toBe(true));
  it('refuses a caller without a person', () => expect(ask({ personKey: '', responsibilities: [resp({ responsibleAvatar: { key: '' } })] })).toBe(false));
  it('ignores an archived responsibility', () => expect(ask({ responsibilities: [resp({ isArchived: true })] })).toBe(false));
});
