import { describe, expect, it } from 'vitest';

import { CostCenterModel } from '@okr/shared-models';

import { COST_CENTER_ID_LENGTH, COST_CENTER_NAME_LENGTH, CostCenterFormModel, costCenterValidations } from './cost-center.validations';

const cc = (okey: string, id: string, name: string, type: CostCenterModel['type'], parentKey = ''): CostCenterModel =>
  Object.assign(new CostCenterModel('scs', 'scs'), { okey, id, name, type, parentKey });

const existing = [cc('r', '000', 'Verein', 'root'), cc('g', '300', 'Sport', 'group', 'r'), cc('l', '310', 'Junioren', 'leaf', 'g')];

const form = (over: Partial<CostCenterFormModel> = {}): CostCenterFormModel => ({
  okey: 'n', id: '320', name: 'Regatta', parentKey: 'g', type: 'leaf', responsibilityKey: '', notes: '', ...over,
});

describe('costCenterValidations', () => {
  it('accepts a valid leaf under a group', () => {
    const r = costCenterValidations(form(), existing);
    expect(r.isValid()).toBe(true);
  });

  it('id: required', () => {
    expect(costCenterValidations(form({ id: '' }), existing).getErrors('id')).toContain('required');
  });
  it('id: rejects more than COST_CENTER_ID_LENGTH characters', () => {
    expect(costCenterValidations(form({ id: 'x'.repeat(COST_CENTER_ID_LENGTH + 1) }), existing).getErrors('id')).toContain('tooLong');
    expect(costCenterValidations(form({ id: 'x'.repeat(COST_CENTER_ID_LENGTH) }), existing).getErrors('id')).toEqual([]);
  });
  it('id: rejects a number another cost centre carries, accepts its own', () => {
    expect(costCenterValidations(form({ id: '310' }), existing).getErrors('id')).toContain('@finance/cost-center/feature.id.duplicate');
    expect(costCenterValidations(form({ okey: 'l', id: '310', parentKey: 'g' }), existing).getErrors('id')).toEqual([]);
  });

  it('name: required', () => {
    expect(costCenterValidations(form({ name: '' }), existing).getErrors('name')).toContain('required');
  });
  it('name: rejects more than COST_CENTER_NAME_LENGTH characters', () => {
    expect(costCenterValidations(form({ name: 'x'.repeat(COST_CENTER_NAME_LENGTH + 1) }), existing).getErrors('name')).toContain('tooLong');
    expect(costCenterValidations(form({ name: 'x'.repeat(COST_CENTER_NAME_LENGTH) }), existing).getErrors('name')).toEqual([]);
  });

  it('parentKey: rejects a move below the own subtree', () => {
    expect(costCenterValidations(form({ okey: 'g', id: '300', type: 'group', parentKey: 'l' }), existing).getErrors('parentKey'))
      .toContain('@finance/cost-center/feature.parentKey.cycle');
    expect(costCenterValidations(form({ okey: 'g', id: '300', type: 'group', parentKey: 'r' }), existing).getErrors('parentKey')).toEqual([]);
  });
  it('parentKey: must point at a root or a group', () => {
    expect(costCenterValidations(form({ parentKey: 'l' }), existing).getErrors('parentKey'))
      .toContain('@finance/cost-center/feature.parentKey.notGroup');
    expect(costCenterValidations(form({ parentKey: 'r' }), existing).getErrors('parentKey')).toEqual([]);
  });
  it('parentKey: has no length cap', () => {
    const long = [...existing, cc('k'.repeat(200), '999', 'Lang', 'group', 'r')];
    expect(costCenterValidations(form({ parentKey: 'k'.repeat(200) }), long).getErrors('parentKey')).toEqual([]);
  });

  it('type: a leaf must have no children', () => {
    expect(costCenterValidations(form({ okey: 'g', id: '300', type: 'leaf', parentKey: 'r' }), existing).getErrors('type'))
      .toContain('@finance/cost-center/feature.type.hasChildren');
    expect(costCenterValidations(form({ okey: 'g', id: '300', type: 'group', parentKey: 'r' }), existing).getErrors('type')).toEqual([]);
  });

  // The add flow: an unsaved node has okey '' — the same value a top-level node carries as
  // parentKey, so a naive "has children" check would match every top-level node.
  it('type: a new leaf under an existing top-level group is valid', () => {
    const tops = [cc('g', '300', 'Sport', 'group')];
    const r = costCenterValidations(form({ okey: '', id: '310', name: 'Junioren', parentKey: 'g' }), tops);
    expect(r.getErrors('type')).toEqual([]);
    expect(r.isValid()).toBe(true);
  });

  it('type: a second new top-level leaf next to an existing root is valid', () => {
    const tops = [cc('r', '000', 'Verein', 'root')];
    const r = costCenterValidations(form({ okey: '', id: '100', name: 'Clubhaus', parentKey: '' }), tops);
    expect(r.getErrors('type')).toEqual([]);
    expect(r.isValid()).toBe(true);
  });
});
