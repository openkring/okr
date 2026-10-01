import { describe, expect, it } from 'vitest';
import { matchCostCenterText } from './cost-center-migration.util';

const centers = [
  { okey: 'k1', id: '310', name: 'Junioren', parentKey: '', accountingTenantId: 'scs' },
  { okey: 'k2', id: '300', name: 'Sport', parentKey: '', accountingTenantId: 'scs' },
  { okey: 'k3', id: '320', name: 'Regatta', parentKey: 'k2', accountingTenantId: 'scs' },
];
describe('matchCostCenterText', () => {
  it('keeps a value that already is a valid okey', () => expect(matchCostCenterText('k1', centers, 'scs')).toBe('k1'));
  it('matches number or name case-insensitively', () => {
    expect(matchCostCenterText(' 310 ', centers, 'scs')).toBe('k1');
    expect(matchCostCenterText('JUNIOREN', centers, 'scs')).toBe('k1');
  });
  it('does not match a group', () => expect(matchCostCenterText('Sport', centers, 'scs')).toBe(''));
  it('returns empty for unknown text and for empty input', () => {
    expect(matchCostCenterText('Vorstand', centers, 'scs')).toBe('');
    expect(matchCostCenterText('', centers, 'scs')).toBe('');
  });
});
