import { describe, expect, it } from 'vitest';
import { esignTransitions } from './esign-workflow-events';

const signee = (id: string, status: string, name = id) => ({ signeeId: id, name, email: `${id}@x.ch`, signOrder: 0, signStatus: status });
const rec = (over: Record<string, unknown> = {}) => ({
  sourceRef: 'approval.ap1', documentStatus: 'in-progress',
  signees: [signee('a', 'pending', 'Anna Muster'), signee('d', 'pending', 'Dieter Widmer')], ...over,
});

describe('esignTransitions', () => {
  it('emits one signee event per newly signed signee', () => {
    const after = rec({ signees: [signee('a', 'signed', 'Anna Muster'), signee('d', 'pending')] });
    expect(esignTransitions(rec(), after, 'e1')).toEqual([{
      event: 'esign.signeeCompleted', relatedKey: 'esignSignee.e1-a',
      params: { esignId: 'e1', approvalKey: 'ap1', signeeName: 'Anna Muster', signedCount: '1', signeeCount: '2' },
    }]);
  });
  it('signee events get distinct relatedKeys', () => {
    const after = rec({ signees: [signee('a', 'signed'), signee('d', 'signed')] });
    const keys = esignTransitions(rec(), after, 'e1').map((e) => e.relatedKey);
    expect(new Set(keys).size).toBe(2);
  });
  it('emits completed only when signedPdfPath appears', () => {
    const before = rec({ documentStatus: 'signed' });
    const after = rec({ documentStatus: 'signed', signedPdfPath: 'tenants/scs/esign/e1/signed.pdf' });
    expect(esignTransitions(before, after, 'e1')).toEqual([{
      event: 'esign.completed', relatedKey: 'approval.ap1',
      params: { esignId: 'e1', approvalKey: 'ap1', signedPdfPath: 'tenants/scs/esign/e1/signed.pdf' },
    }]);
    expect(esignTransitions(after, after, 'e1')).toEqual([]);
  });
  it('emits failed on a transition into rejected', () => {
    expect(esignTransitions(rec(), rec({ documentStatus: 'rejected' }), 'e1')[0])
      .toMatchObject({ event: 'esign.failed', params: { reason: 'rejected' } });
  });
  it('ignores runs that do not come from an approval', () => {
    expect(esignTransitions(rec({ sourceRef: 'meeting.m1' }), rec({ sourceRef: 'meeting.m1', signedPdfPath: 'p' }), 'e1')).toEqual([]);
  });
});
