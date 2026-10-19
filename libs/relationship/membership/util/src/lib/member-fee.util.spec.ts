import { describe, it, expect } from 'vitest';
import { MemberFeeModel, MembershipModel } from '@okr/shared-models';
import { billedMemberships, feeRowsOfBooks } from './member-fee.util';

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
