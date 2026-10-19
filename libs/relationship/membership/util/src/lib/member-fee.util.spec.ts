import { describe, it, expect } from 'vitest';
import { MemberFeeModel, MembershipModel } from '@okr/shared-models';
import { billedCategoryKey, billedMemberships, feeRowsOfBooks, feeScreenState, reloadRefusal, rowMemberKeysOfBooks } from './member-fee.util';

const GSS_ORG = 'mkdf7xin64es5q4rmhdj';
const SCS_ORG = 'scs';
const TODAY = '20261019';

function feeRow(okey: string, accountingTenantId: string, memberKey = okey): MemberFeeModel {
  const fee = new MemberFeeModel('scs');
  fee.okey = okey;
  fee.accountingTenantId = accountingTenantId;
  fee.member = { key: memberKey, name1: '', name2: '', modelType: 'person', type: '', subType: '', label: '' };
  return fee;
}

function membership(memberKey: string, orgKey: string, overrides: Partial<MembershipModel> = {}): MembershipModel {
  const m = new MembershipModel('scs');
  m.okey = `${memberKey}-${orgKey}`;
  m.memberKey = memberKey;
  m.memberModelType = 'person';
  m.orgKey = orgKey;
  m.orgModelType = 'org';
  m.state = 'active';
  m.dateOfExit = '99991231';
  return Object.assign(m, overrides);
}

describe('feeRowsOfBooks', () => {
  const rows = [feeRow('a', 'scs'), feeRow('b', 'gss'), feeRow('c', '')];

  it('keeps only the rows of the scs books', () => {
    expect(feeRowsOfBooks(rows, 'scs').map(r => r.okey)).toEqual(['a']);
  });

  it('keeps only the rows of the gss books', () => {
    expect(feeRowsOfBooks(rows, 'gss').map(r => r.okey)).toEqual(['b']);
  });

  it('never returns a legacy row without books, not even for empty books', () => {
    expect(feeRowsOfBooks(rows, '')).toEqual([]);
  });

  it('treats a row whose field is missing (legacy doc) as having no books', () => {
    const legacy = feeRow('d', 'scs');
    delete (legacy as Partial<MemberFeeModel>).accountingTenantId;
    expect(feeRowsOfBooks([legacy], 'scs')).toEqual([]);
  });
});

describe('billedMemberships', () => {
  it('keeps the active and passive memberships of the gss org', () => {
    const all = [
      membership('p1', GSS_ORG),
      membership('p2', GSS_ORG, { state: 'passive' }),
      membership('p3', SCS_ORG),
    ];
    expect(billedMemberships(all, GSS_ORG, TODAY).map(m => m.memberKey)).toEqual(['p1', 'p2']);
  });

  it('drops a membership that exits today', () => {
    const all = [membership('p1', GSS_ORG, { dateOfExit: TODAY }), membership('p2', GSS_ORG, { dateOfExit: '20261020' })];
    expect(billedMemberships(all, GSS_ORG, TODAY).map(m => m.memberKey)).toEqual(['p2']);
  });

  it('drops a candidate', () => {
    const all = [membership('p1', GSS_ORG, { state: 'pending' }), membership('p2', GSS_ORG)];
    expect(billedMemberships(all, GSS_ORG, TODAY).map(m => m.memberKey)).toEqual(['p2']);
  });

  it('drops a group membership with the same okey', () => {
    const all = [membership('p1', GSS_ORG, { orgModelType: 'group' }), membership('p2', GSS_ORG)];
    expect(billedMemberships(all, GSS_ORG, TODAY).map(m => m.memberKey)).toEqual(['p2']);
  });

  it('lists a member of both clubs only in the list of each org', () => {
    const all = [membership('both', SCS_ORG), membership('both', GSS_ORG, { category: 'goenner' })];
    const scs = billedMemberships(all, SCS_ORG, TODAY);
    const gss = billedMemberships(all, GSS_ORG, TODAY);
    expect(scs.map(m => m.orgKey)).toEqual([SCS_ORG]);
    expect(gss.map(m => m.orgKey)).toEqual([GSS_ORG]);
    expect(gss[0].category).toBe('goenner');
  });

  it('returns nothing without an org', () => {
    expect(billedMemberships([membership('p1', GSS_ORG)], '', TODAY)).toEqual([]);
  });
});

describe('billedCategoryKey', () => {
  it('prices a gss run from the Gönnerverein\'s own list', () => {
    expect(billedCategoryKey({ membershipCategoryKey: 'mcat_gss' })).toBe('mcat_gss');
  });

  it('falls back to mcat for an org doc without the field', () => {
    expect(billedCategoryKey({})).toBe('mcat');
    expect(billedCategoryKey({ membershipCategoryKey: '' })).toBe('mcat');
  });

  it('falls back to mcat when the org is not loaded', () => {
    expect(billedCategoryKey(undefined)).toBe('mcat');
  });
});

describe('feeScreenState', () => {
  it('is loading while the config has not loaded, even without an owner', () => {
    expect(feeScreenState(false, true, undefined)).toBe('loading');
    expect(feeScreenState(false, false, GSS_ORG)).toBe('loading');
  });

  it('is loading while the fee rows have not loaded', () => {
    expect(feeScreenState(true, false, GSS_ORG)).toBe('loading');
  });

  it('is no-org once loaded and the books have no org owner', () => {
    expect(feeScreenState(true, true, undefined)).toBe('no-org');
  });

  it('is ready once both are loaded and an org owns the books', () => {
    expect(feeScreenState(true, true, GSS_ORG)).toBe('ready');
  });

  it('is error when the config read failed, whatever else holds', () => {
    expect(feeScreenState(false, false, undefined, true)).toBe('error');
    expect(feeScreenState(true, true, GSS_ORG, true)).toBe('error');
  });
});

describe('reloadRefusal', () => {
  it('refuses while any row of the tenant has no books (migration not run, old client)', () => {
    expect(reloadRefusal([feeRow('a', 'scs'), feeRow('b', '')])).toBe('legacy-rows');
  });

  it('refuses for a legacy doc that lacks the field', () => {
    const legacy = feeRow('d', 'scs');
    delete (legacy as Partial<MemberFeeModel>).accountingTenantId;
    expect(reloadRefusal([legacy])).toBe('legacy-rows');
  });

  it('lets the reload run when every row carries books', () => {
    expect(reloadRefusal([feeRow('a', 'scs'), feeRow('b', 'gss')])).toBeUndefined();
    expect(reloadRefusal([])).toBeUndefined();
  });
});

describe('rowMemberKeysOfBooks', () => {
  it('names the members that already have a row in these books only', () => {
    const rows = [feeRow('a', 'scs', 'p1'), feeRow('b', 'gss', 'p2'), feeRow('c', 'gss', 'p1'), feeRow('d', '', 'p3')];
    expect([...rowMemberKeysOfBooks(rows, 'gss')].sort()).toEqual(['p1', 'p2']);
    expect([...rowMemberKeysOfBooks(rows, 'scs')]).toEqual(['p1']);
  });

  it('skips a row without a member', () => {
    const row = feeRow('a', 'scs');
    row.member = undefined;
    expect(rowMemberKeysOfBooks([row], 'scs').size).toBe(0);
  });
});
