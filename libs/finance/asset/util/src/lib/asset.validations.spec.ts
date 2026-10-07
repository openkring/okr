import { describe, expect, it } from 'vitest';
import { AssetModel } from '@okr/shared-models';
import { ASSET_NAME_LENGTH, assetValidations } from './asset.validations';

const asset = (patch: Partial<AssetModel> = {}): AssetModel => ({ ...new AssetModel('scs', 'scs'), ...patch } as AssetModel);

describe('assetValidations', () => {
  it('accepts a new, empty asset (the old dialog had no mandatory field)', () => {
    expect(assetValidations(asset()).isValid()).toBe(true);
  });

  it('accepts a complete asset', () => {
    expect(assetValidations(asset({ name: 'Laptop', assetNo: 'HW-2026-001', acquisitionDate: '20260115', usefulLifeMonths: 36 })).isValid()).toBe(true);
  });

  it('rejects a name longer than the input cap', () => {
    expect(assetValidations(asset({ name: 'x'.repeat(ASSET_NAME_LENGTH + 1) })).hasErrors('name')).toBe(true);
  });

  it('rejects an asset number longer than the input cap', () => {
    expect(assetValidations(asset({ assetNo: 'x'.repeat(ASSET_NAME_LENGTH + 1) })).hasErrors('assetNo')).toBe(true);
  });

  it('rejects an invalid acquisition date', () => {
    expect(assetValidations(asset({ acquisitionDate: '20261340' })).hasErrors('acquisitionDate')).toBe(true);
  });

  it('rejects a negative or fractional useful life', () => {
    expect(assetValidations(asset({ usefulLifeMonths: -1 })).hasErrors('usefulLifeMonths')).toBe(true);
    expect(assetValidations(asset({ usefulLifeMonths: 1.5 })).hasErrors('usefulLifeMonths')).toBe(true);
  });
});
