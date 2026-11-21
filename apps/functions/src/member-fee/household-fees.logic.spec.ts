import { describe, expect, it } from 'vitest';

import type { AvatarInfo, HouseholdModel, MemberFeeModel, MemberFeePosition } from '@okr/shared-models';

import {
  ADDRESS_MISMATCH_NOTE, applyHouseholdFeeCap, groupFeesByHousehold, householdInvoiceDraft, sameAddress, withReviewNote,
} from './household-fees.logic';

const position = (overrides: Partial<MemberFeePosition> = {}): MemberFeePosition => ({
  key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
  amount: 400, accountKey: 'acc1', vatCodeKey: 'v1', ...overrides,
});
const fees = (...amounts: number[]) => amounts.map(amount => position({ amount }));

const person = (key: string, name1: string, name2 = 'Muster'): AvatarInfo =>
  ({ key, name1, name2, modelType: 'person', type: '', subType: '', label: `${name1} ${name2}` });

const row = (key: string, personKey: string, positions: MemberFeePosition[] = [position()]): MemberFeeModel =>
  ({ okey: key, member: person(personKey, personKey.toUpperCase()), positions } as unknown as MemberFeeModel);

const household = (over: Partial<HouseholdModel> = {}): HouseholdModel => ({
  okey: 'h1', tenants: ['scs'], isArchived: false, index: '', tags: '', notes: '', name: 'Familie Muster', type: 'family',
  memberKeys: ['anna', 'ben', 'cleo'], payerKey: 'anna', contactKey: 'anna',
  bundle: { post: true, email: false, inApp: false }, ...over,
} as HouseholdModel);

describe('applyHouseholdFeeCap (cap CHF 600)', () => {
  it('adds nothing below the cap (400 + 150)', () => {
    expect(applyHouseholdFeeCap(fees(400, 150), 600, true)).toBeUndefined();
  });

  it('adds nothing exactly at the cap (400 + 200)', () => {
    expect(applyHouseholdFeeCap(fees(400, 200), 600, true)).toBeUndefined();
  });

  it('caps two adults and three children (400 + 400 + 150 × 3 = 1250) with a rebate of 650', () => {
    const rebate = applyHouseholdFeeCap(fees(400, 400, 150, 150, 150), 600, true);
    expect(rebate?.amount).toBe(650);
    expect(rebate?.type).toBe('rebate');
    expect(rebate?.label).toBe('Familienrabatt');
    expect(rebate?.accountKey).toBe('acc1');
  });

  it('counts only the membership fee when onlyMembershipFee is true (extras billed in full)', () => {
    const positions = [...fees(400, 400), position({ key: 'bev', usage: 'beverages', amount: 80 })];
    expect(applyHouseholdFeeCap(positions, 600, true)?.amount).toBe(200);
  });

  it('counts every non-rebate position when onlyMembershipFee is false', () => {
    const positions = [...fees(400, 400), position({ key: 'bev', usage: 'beverages', amount: 80 })];
    expect(applyHouseholdFeeCap(positions, 600, false)?.amount).toBe(280);
  });

  it('counts only the membership fee when onlyMembershipFee is missing (default true)', () => {
    const positions = [...fees(400, 400), position({ key: 'bev', usage: 'beverages', amount: 80 })];
    expect(applyHouseholdFeeCap(positions, 600, undefined)?.amount).toBe(200);
  });

  it('subtracts existing rebates before capping', () => {
    const positions = [...fees(400, 400), position({ key: 'rebate', type: 'rebate', usage: 'other', amount: 100 })];
    expect(applyHouseholdFeeCap(positions, 600, true)?.amount).toBe(100);
  });

  it('has no cap when feeCap is 0 or missing', () => {
    expect(applyHouseholdFeeCap(fees(400, 400, 150), 0, true)).toBeUndefined();
    expect(applyHouseholdFeeCap(fees(400, 400, 150), undefined, true)).toBeUndefined();
  });
});

describe('sameAddress', () => {
  const postal = (over: Record<string, string> = {}) => ({
    street: '', zipCity: '', streetName: 'Seestrasse', streetNumber: '4', zipCode: '8712', city: 'Stäfa', countryCode: 'CH', ...over,
  });

  it('is true when street, number and zip match, ignoring case and whitespace', () => {
    expect(sameAddress([postal(), postal({ streetName: '  seestrasse ', streetNumber: ' 4', city: 'Staefa' })])).toBe(true);
  });

  it('is false when the zip differs', () => {
    expect(sameAddress([postal(), postal({ zipCode: '8713' })])).toBe(false);
  });

  it('is false when one person has no postal address', () => {
    expect(sameAddress([postal(), undefined])).toBe(false);
  });
});

describe('groupFeesByHousehold', () => {
  it('leaves the rows of a household without payer as singles', () => {
    const rows = [row('f1', 'anna'), row('f2', 'ben')];
    const r = groupFeesByHousehold(rows, [household({ payerKey: '' })]);
    expect(r.groups).toEqual([]);
    expect(r.singles).toEqual(rows);
  });

  it('leaves the rows as singles when the payer is not a household member', () => {
    const rows = [row('f1', 'anna'), row('f2', 'ben')];
    const r = groupFeesByHousehold(rows, [household({ payerKey: 'zoe' })]);
    expect(r.groups).toEqual([]);
    expect(r.singles).toEqual(rows);
  });

  it('makes one group of one row for a non-member parent paying for one child', () => {
    const rows = [row('f1', 'kid'), row('f2', 'other')];
    const r = groupFeesByHousehold(rows, [household({ memberKeys: ['parent', 'kid'], payerKey: 'parent' })]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rows.map(x => x.okey)).toEqual(['f1']);
    expect(r.singles.map(x => x.okey)).toEqual(['f2']);
  });

  it('merges every row of a household with a payer and ignores archived households', () => {
    const rows = [row('f1', 'anna'), row('f2', 'ben'), row('f3', 'cleo')];
    const r = groupFeesByHousehold(rows, [household(), household({ okey: 'h2', isArchived: true, memberKeys: ['cleo'], payerKey: 'cleo' })]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].household.okey).toBe('h1');
    expect(r.groups[0].rows.map(x => x.okey)).toEqual(['f1', 'f2', 'f3']);
    expect(r.singles).toEqual([]);
  });
});

describe('householdInvoiceDraft', () => {
  const o = { tenantId: 'scs', accountingTenantId: 'scs', year: 2026, invoiceDate: '20261121', dueDate: '20261221' };
  const payer = person('anna', 'Anna');
  const group = {
    household: household(),
    rows: [row('f1', 'anna', fees(400)), row('f2', 'ben', fees(400)), row('f3', 'cleo', fees(150, 150, 150))],
  };

  it('bills the payer, one position per member fee, plus the family rebate', () => {
    const { invoice, positions } = householdInvoiceDraft(group, payer, { ...o, feeCap: 600 });
    expect(invoice.receiver).toBe(payer);
    expect(invoice.state).toBe('draft');
    expect(invoice.invoiceNo).toBe(0);
    expect(invoice.accountingTenantId).toBe('scs');
    expect(invoice.title).toBe('2026 Familie Muster');
    expect(positions.map(p => p.amount)).toEqual([400, 400, 150, 150, 150, -650]);
    expect(positions.map(p => p.member?.key)).toEqual(['anna', 'ben', 'cleo', 'cleo', 'cleo', 'anna']);
    expect(positions[1].description).toBe('BEN Muster');
    expect(positions[5].label).toBe('Familienrabatt');
    expect(invoice.totalAmount).toEqual({ amount: 60000, currency: 'CHF', periodicity: 'one-time' });
  });

  it('adds no rebate without a cap', () => {
    const { invoice, positions } = householdInvoiceDraft(group, payer, o);
    expect(positions.some(p => p.type === 'rebate')).toBe(false);
    expect(invoice.totalAmount.amount).toBe(125000);
  });

  it('keeps a pro-rata description after the member name', () => {
    const g = { household: household(), rows: [row('f1', 'ben', [position({ description: 'pro rata verrechnet, 7 Monate' })])] };
    expect(householdInvoiceDraft(g, payer, o).positions[0].description).toBe('BEN Muster – pro rata verrechnet, 7 Monate');
  });
});

describe('withReviewNote', () => {
  it('appends the note once', () => {
    expect(withReviewNote('')).toBe(ADDRESS_MISMATCH_NOTE);
    expect(withReviewNote('Rabatt geprüft')).toBe(`Rabatt geprüft\n${ADDRESS_MISMATCH_NOTE}`);
    expect(withReviewNote(withReviewNote('x'))).toBe(`x\n${ADDRESS_MISMATCH_NOTE}`);
  });
});
