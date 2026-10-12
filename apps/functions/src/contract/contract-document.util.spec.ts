import { describe, expect, it } from 'vitest';
import {
  buildContractDocumentStamp, canReadContractData, canShareContractDocument, canWriteContracts, contractDocumentPath, needsRestamp,
  pickSummarySource, sharedDocumentRefs, upsertDocumentRef,
} from './contract-document.util';

const v = (roles: Record<string, boolean>, personKey = 'pX') => ({ tenantIds: ['t1'], roles, personKey });
const doc = (p: Record<string, unknown> = {}) => ({ tenants: ['t1'], partyPersonKeys: ['pA'], isStrictlyConfidential: false, ...p });

describe('canReadContractData', () => {
  it('treasurer reads strict', () => expect(canReadContractData(v({ treasurer: true }), doc({ isStrictlyConfidential: true }))).toBe(true));
  it('privileged not strict', () => expect(canReadContractData(v({ privileged: true }), doc({ isStrictlyConfidential: true }))).toBe(false));
  it('auditor non-strict', () => expect(canReadContractData(v({ auditor: true }), doc())).toBe(true));
  it('party in another tenant', () => expect(canReadContractData({ tenantIds: ['t9'], roles: {}, personKey: 'pA' }, doc())).toBe(true));
  it('staff of another tenant denied', () => expect(canReadContractData({ tenantIds: ['t9'], roles: { treasurer: true }, personKey: '' }, doc())).toBe(false));
  it('stranger denied', () => expect(canReadContractData(v({}), doc())).toBe(false));
  it('empty personKey never matches', () => expect(canReadContractData(v({}, ''), doc({ partyPersonKeys: [''] }))).toBe(false));
  it('missing doc denied', () => expect(canReadContractData(v({ admin: true }), undefined)).toBe(false));
});

describe('canWriteContracts', () => {
  it('admin and treasurer only', () => {
    expect(canWriteContracts(v({ admin: true }))).toBe(true);
    expect(canWriteContracts(v({ treasurer: true }))).toBe(true);
    expect(canWriteContracts(v({ privileged: true }))).toBe(false);
  });
});

describe('contractDocumentPath', () => {
  it('lower-cases a sane extension', () => expect(contractDocumentPath('scs', 'c1', 'd1', 'Vertrag.PDF')).toBe('tenant/scs/contracts/c1/d1.pdf'));
  it('no extension → bin', () => expect(contractDocumentPath('scs', 'c1', 'd1', 'README')).toBe('tenant/scs/contracts/c1/d1.bin'));
  it('rejects path tricks in keys', () => expect(() => contractDocumentPath('scs', '../x', 'd1', 'a.pdf')).toThrow());
});

describe('upsertDocumentRef', () => {
  const a = { docKey: 'd1', role: 'contract' as const, title: 'Vertrag', docState: 'draft' as const };
  it('appends', () => expect(upsertDocumentRef([], a, '')).toEqual([a]));
  it('replaces the prior version in place', () => {
    const b = { ...a, docKey: 'd2', docState: 'signed' as const };
    expect(upsertDocumentRef([a, { ...a, docKey: 'd3', role: 'annex' as const }], b, 'd1').map((r) => r.docKey)).toEqual(['d2', 'd3']);
  });
  it('same docKey registered twice stays one entry, updated in place', () => {
    const x = { ...a, docKey: 'd0', role: 'annex' as const };
    const again = { ...a, title: 'Vertrag v2', docState: 'final' as const };
    expect(upsertDocumentRef([x, a], again, '')).toEqual([x, again]);
  });
  it('same docKey with a listed prior version: one entry for docKey, prior dropped', () => {
    const prior = { ...a, docKey: 'd0' };
    const b = { ...a, docKey: 'd2', docState: 'signed' as const };
    const d3 = { ...a, docKey: 'd3', role: 'annex' as const };
    const out = upsertDocumentRef([prior, d3, { ...b, docState: 'draft' as const }], b, 'd0');
    expect(out).toEqual([d3, b]);
    expect(out.filter((r) => r.docKey === 'd2')).toHaveLength(1);
  });
  it('retry after a prior-version replace does not duplicate', () => {
    const b = { ...a, docKey: 'd2' };
    const once = upsertDocumentRef([a], b, 'd1');
    expect(upsertDocumentRef(once, b, 'd1')).toEqual([b]);
  });
  it('a new version inherits sharedWithMembers from the prior version (spec 1.97)', () => {
    const b = { ...a, docKey: 'd2' };
    expect(upsertDocumentRef([{ ...a, sharedWithMembers: true }], b, 'd1')).toEqual([{ ...b, sharedWithMembers: true }]);
  });
  it('an unshared prior version gives an unshared new version without the field', () => {
    const out = upsertDocumentRef([a], { ...a, docKey: 'd2' }, 'd1');
    expect(out[0]).not.toHaveProperty('sharedWithMembers');
  });
  it('a retried register keeps the flag already on its own entry', () => {
    const b = { ...a, docKey: 'd2' };
    expect(upsertDocumentRef([{ ...b, sharedWithMembers: true }], b, 'd1')).toEqual([{ ...b, sharedWithMembers: true }]);
  });
  it('a brand-new file starts unshared', () => {
    expect(upsertDocumentRef([{ ...a, sharedWithMembers: true }], { ...a, docKey: 'd2' }, '')[1]).not.toHaveProperty('sharedWithMembers');
  });
});

describe('pickSummarySource', () => {
  it('prefers signed contract, then final, then newest contract file', () => {
    const r = (docKey: string, role: 'contract' | 'annex', docState: 'draft' | 'final' | 'signed') => ({ docKey, role, title: docKey, docState });
    expect(pickSummarySource([r('a', 'contract', 'draft'), r('b', 'contract', 'final'), r('c', 'contract', 'signed')])?.docKey).toBe('c');
    expect(pickSummarySource([r('a', 'contract', 'draft'), r('b', 'contract', 'final')])?.docKey).toBe('b');
    expect(pickSummarySource([r('a', 'contract', 'draft'), r('x', 'annex', 'signed'), r('b', 'contract', 'draft')])?.docKey).toBe('b');
    expect(pickSummarySource([r('x', 'annex', 'signed')])).toBeUndefined();
  });
});

describe('needsRestamp', () => {
  it('party removed → true', () => expect(needsRestamp(doc(), doc({ partyPersonKeys: [] }))).toBe(true));
  it('strictness changed → true', () => expect(needsRestamp(doc(), doc({ isStrictlyConfidential: true }))).toBe(true));
  it('tenants changed → true', () => expect(needsRestamp(doc(), doc({ tenants: ['t1', 't2'] }))).toBe(true));
  it('name changed only → false', () => expect(needsRestamp(doc(), doc({ name: 'neu' }))).toBe(false));
  it('deleted → false', () => expect(needsRestamp(doc(), undefined)).toBe(false));
});

describe('canReadContractData strict default', () => {
  it('missing flag counts as strict for privileged', () => expect(canReadContractData(v({ privileged: true }), { tenants: ['t1'], partyPersonKeys: [] })).toBe(false));
  it('same-tenant non-staff non-party denied', () => expect(canReadContractData(v({}), doc())).toBe(false));
});

describe('buildContractDocumentStamp', () => {
  it('missing flag → strict', () => {
    const s = buildContractDocumentStamp({ tenants: ['t1'] });
    expect(s.isStrictlyConfidential).toBe(true);
    expect(s.confidentiality).toBe('strictlyConfidential');
  });
  it('flag false → false, internal default', () => {
    const s = buildContractDocumentStamp({ isStrictlyConfidential: false });
    expect(s.isStrictlyConfidential).toBe(false);
    expect(s.confidentiality).toBe('internal');
  });
  it('non-array keys → []', () => {
    const s = buildContractDocumentStamp({ partyPersonKeys: 'x', tenants: null });
    expect(s.partyPersonKeys).toEqual([]);
    expect(s.tenants).toEqual([]);
  });
});

describe('sharedDocumentRefs (spec 1.97 §5.3)', () => {
  const shared = { docKey: 's1', role: 'contract' as const, title: 'Police', docState: 'final' as const, sharedWithMembers: true };
  const hidden = { docKey: 'h1', role: 'annex' as const, title: 'Prämie', docState: 'final' as const };
  const c = (p: Record<string, unknown> = {}) => doc({ documents: [shared, hidden], ...p });
  const member = v({ registered: true });
  it('a member of the tenant gets only the shared refs', () => expect(sharedDocumentRefs(member, c())).toEqual([shared]));
  it('a member of another tenant gets nothing', () =>
    expect(sharedDocumentRefs({ tenantIds: ['t9'], roles: { registered: true }, personKey: 'pX' }, c())).toEqual([]));
  it('a user without the registered role gets nothing', () => expect(sharedDocumentRefs(v({}), c())).toEqual([]));
  it('an admin counts as a member', () => expect(sharedDocumentRefs(v({ admin: true }), c())).toEqual([shared]));
  it('archived contract → nothing', () => expect(sharedDocumentRefs(member, c({ isArchived: true }))).toEqual([]));
  it('strictly confidential → nothing', () => expect(sharedDocumentRefs(member, c({ isStrictlyConfidential: true }))).toEqual([]));
  it('missing strictness flag counts as strict', () => {
    const d = c();
    delete (d as Record<string, unknown>)['isStrictlyConfidential'];
    expect(sharedDocumentRefs(member, d)).toEqual([]);
  });
  it('no shared file → nothing', () => expect(sharedDocumentRefs(member, c({ documents: [hidden] }))).toEqual([]));
  it('missing contract → nothing', () => expect(sharedDocumentRefs(member, undefined)).toEqual([]));
  it('non-array documents → nothing', () => expect(sharedDocumentRefs(member, c({ documents: 'x' }))).toEqual([]));
});

describe('canShareContractDocument', () => {
  it('internal contract may be shared', () => expect(canShareContractDocument(doc())).toBe(true));
  it('strictly confidential may not', () => expect(canShareContractDocument(doc({ isStrictlyConfidential: true }))).toBe(false));
  it('missing flag counts as strict', () => expect(canShareContractDocument({ tenants: ['t1'] })).toBe(false));
});
