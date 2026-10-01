import { describe, expect, it } from 'vitest';
import { assertExplicitCostCenter, belongsToAccountingTenant, costCenterKeyForLine, CostCenterContext } from './cost-center-context';

const ctx: CostCenterContext = {
  accountingTenantId: 'scs',
  accounts: new Map([
    ['scs-6300', { okey: 'scs-6300', id: '6300', costCenterKey: 'cc-reg', accountingTenantId: 'scs' }],
    ['scs-1020', { okey: 'scs-1020', id: '1020', costCenterKey: '', accountingTenantId: 'scs' }],
  ]),
  costCenters: [
    { okey: 'cc-jun', parentKey: '', accountingTenantId: 'scs' },
    { okey: 'cc-reg', parentKey: '', accountingTenantId: 'scs' },
    { okey: 'cc-old', parentKey: '', accountingTenantId: 'scs', isArchived: true },
  ],
};

describe('costCenterKeyForLine', () => {
  it('uses the account default without input', () => expect(costCenterKeyForLine(ctx, 'scs-6300')).toBe('cc-reg'));
  it('prefers a valid explicit key', () => expect(costCenterKeyForLine(ctx, 'scs-6300', { explicit: 'cc-jun' })).toBe('cc-jun'));
  it('is empty on a balance-sheet line', () => expect(costCenterKeyForLine(ctx, 'scs-1020', { explicit: 'cc-jun' })).toBe(''));
  it('is empty for an unknown account', () => expect(costCenterKeyForLine(ctx, 'scs-9999', { rule: 'cc-jun' })).toBe(''));
});

describe('assertExplicitCostCenter', () => {
  it('accepts empty and valid keys', () => {
    expect(() => assertExplicitCostCenter(ctx, 'scs-6300', '', new Set())).not.toThrow();
    expect(() => assertExplicitCostCenter(ctx, 'scs-6300', 'cc-jun', new Set())).not.toThrow();
  });
  it('rejects an archived key that is new to the booking', () =>
    expect(() => assertExplicitCostCenter(ctx, 'scs-6300', 'cc-old', new Set())).toThrow(/cost-center-invalid/));
  it('accepts an archived key already stored on this booking (grandfathered)', () =>
    expect(() => assertExplicitCostCenter(ctx, 'scs-6300', 'cc-old', new Set(['cc-old']))).not.toThrow());
  it('rejects any key on a balance-sheet line', () =>
    expect(() => assertExplicitCostCenter(ctx, 'scs-1020', 'cc-jun', new Set())).toThrow(/cost-center-invalid/));
});

describe('belongsToAccountingTenant', () => {
  it('accepts the same accounting tenant', () => expect(belongsToAccountingTenant({ accountingTenantId: 'scs' }, 'scs')).toBe(true));
  it('rejects another accounting tenant or none', () => {
    expect(belongsToAccountingTenant({ accountingTenantId: 'gss' }, 'scs')).toBe(false);
    expect(belongsToAccountingTenant({}, 'scs')).toBe(false);
  });
});
