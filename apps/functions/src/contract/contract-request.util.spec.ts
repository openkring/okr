// apps/functions/src/contract/contract-request.util.spec.ts
import { describe, expect, it } from 'vitest';
import {
  buildContractPayload, buildSignatureBlocks, checkContractEligibility, formatPostalAddress, isActiveMembership,
} from './contract-request.util';

const TODAY = '20261005';
const m = (over: Record<string, unknown> = {}) => ({
  orgKey: 'scs', category: 'active', isArchived: false, dateOfEntry: '20200101', dateOfExit: '99991231', ...over,
});

describe('isActiveMembership', () => {
  it('an open active membership of the org is active', () => {
    expect(isActiveMembership(m(), 'scs', TODAY)).toBe(true);
  });
  it('an exited membership is not active, even with state active', () => {
    expect(isActiveMembership(m({ dateOfExit: '20161231', state: 'active' }), 'scs', TODAY)).toBe(false);
  });
  it('a passive or archived or other-org membership is not active', () => {
    expect(isActiveMembership(m({ category: 'passive' }), 'scs', TODAY)).toBe(false);
    expect(isActiveMembership(m({ isArchived: true }), 'scs', TODAY)).toBe(false);
    expect(isActiveMembership(m({ orgKey: 'gss' }), 'scs', TODAY)).toBe(false);
  });
  it('a membership starting in the future is not active yet', () => {
    expect(isActiveMembership(m({ dateOfEntry: '20270101' }), 'scs', TODAY)).toBe(false);
  });
});

describe('checkContractEligibility', () => {
  const base = {
    eligibility: ['activeMember', 'noOpenRequest'],
    orgKey: 'scs', kind: 'skiffPlatz', today: TODAY,
    memberships: [m()],
    approvals: [] as Record<string, unknown>[],
    contracts: [] as Record<string, unknown>[],
    esignRuns: [] as Record<string, unknown>[],
    postalAddress: { street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
  };
  it('passes an active member without open requests', () => {
    expect(checkContractEligibility(base)).toBeUndefined();
  });
  it('refuses a non-member', () => {
    expect(checkContractEligibility({ ...base, memberships: [] })).toBe('notActive');
  });
  it('refuses a pending approval of the same kind', () => {
    expect(checkContractEligibility({ ...base, approvals: [{ kind: 'skiffPlatz', state: 'pending' }] })).toBe('openRequest');
  });
  it('ignores a decided or other-kind approval', () => {
    expect(checkContractEligibility({ ...base, approvals: [{ kind: 'skiffPlatz', state: 'rejected' }, { kind: 'key', state: 'pending' }] })).toBeUndefined();
  });
  it('refuses an approved request whose contract is not filed yet (signing in progress)', () => {
    expect(checkContractEligibility({ ...base, approvals: [{ okey: 'ap1', kind: 'skiffPlatz', state: 'approved' }] })).toBe('openRequest');
  });
  const approvedAp1 = [{ okey: 'ap1', kind: 'skiffPlatz', state: 'approved' }];
  it('an approved request whose every signature run failed does not block a new one', () => {
    expect(checkContractEligibility({ ...base, approvals: approvedAp1, esignRuns: [
      { sourceRef: 'approval.ap1', documentStatus: 'rejected' },
      { sourceRef: 'approval.ap1', documentStatus: 'withdrawn' },
      { sourceRef: 'approval.ap1', documentStatus: 'error' },
    ] })).toBeUndefined();
  });
  it('an approved request with one live signature run stays open', () => {
    expect(checkContractEligibility({ ...base, approvals: approvedAp1, esignRuns: [
      { sourceRef: 'approval.ap1', documentStatus: 'rejected' },
      { sourceRef: 'approval.ap1', documentStatus: 'in-progress' },
    ] })).toBe('openRequest');
  });
  it('an approved request without any signature run yet stays open (signing being set up)', () => {
    expect(checkContractEligibility({ ...base, approvals: approvedAp1, esignRuns: [
      { sourceRef: 'approval.other', documentStatus: 'rejected' },
    ] })).toBe('openRequest');
  });
  it('an approved request whose contract has ended does not block a new one', () => {
    expect(checkContractEligibility({ ...base,
      approvals: [{ okey: 'ap1', kind: 'skiffPlatz', state: 'approved' }],
      contracts: [{ tags: 'contract:skiffPlatz', state: 'ended', sourceRef: 'approval.ap1' }] })).toBeUndefined();
  });
  it('refuses a non-ended contract of the kind', () => {
    expect(checkContractEligibility({ ...base, contracts: [{ tags: 'contract:skiffPlatz', state: 'active' }] })).toBe('openRequest');
  });
  it('ignores an ended contract of the kind', () => {
    expect(checkContractEligibility({ ...base, contracts: [{ tags: 'contract:skiffPlatz', state: 'ended' }] })).toBeUndefined();
  });
  it('refuses without a postal address', () => {
    expect(checkContractEligibility({ ...base, postalAddress: undefined })).toBe('noAddress');
  });
  it('skips checks the kind does not list', () => {
    expect(checkContractEligibility({ ...base, eligibility: [], memberships: [] })).toBeUndefined();
  });
});

describe('formatPostalAddress', () => {
  it('joins street + number and zip + city', () => {
    expect(formatPostalAddress({ streetName: 'Seestrasse', streetNumber: '1', zipCode: '8712', city: 'Stäfa' }))
      .toEqual({ street: 'Seestrasse 1', zipCity: '8712 Stäfa' });
  });
  it('is undefined without street or city', () => {
    expect(formatPostalAddress({ streetName: '', zipCode: '8712', city: 'Stäfa' })).toBeUndefined();
    expect(formatPostalAddress(undefined)).toBeUndefined();
  });
});

describe('buildSignatureBlocks', () => {
  const signers = [
    { role: 'applicant' as const, responsibilityKey: '', signOrder: 0, label: 'Mieterin / Mieter' },
    { role: 'responsibility' as const, responsibilityKey: 'president', signOrder: 1, label: 'Präsident SCS' },
  ];
  const resolved = [
    { name: 'Anna Muster', email: 'anna@example.ch' },
    { name: 'Dieter Widmer', email: 'dieter@example.ch' },
  ];
  it('emits one DeepSign pattern per signer, in signer order', () => {
    const blocks = buildSignatureBlocks(signers, resolved);
    expect(blocks.map(b => b.pattern)).toEqual([
      '#deepsign#anna@example.ch#0#', '#deepsign#dieter@example.ch#1#',
    ]);
    expect(blocks[1]).toMatchObject({ name: 'Dieter Widmer', label: 'Präsident SCS' });
  });
  it('drops the order suffix when parallel signing is requested', () => {
    expect(buildSignatureBlocks(signers, resolved, { ordered: false })[0].pattern).toBe('#deepsign#anna@example.ch#');
  });
  it('throws when a signer has no email', () => {
    expect(() => buildSignatureBlocks(signers, [resolved[0], { name: 'Dieter Widmer', email: '' }])).toThrow(/email/);
  });
});

describe('buildContractPayload', () => {
  it('carries applicant, view date, terms and blocks', () => {
    const p = buildContractPayload({
      applicant: { name: 'Anna Muster', street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
      today: TODAY, terms: { rent: '600.00' }, signatureBlocks: [],
    });
    expect(p).toEqual({
      applicant: { name: 'Anna Muster', street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
      date: '05.10.2026', terms: { rent: '600.00' }, signatureBlocks: [],
    });
  });
});
