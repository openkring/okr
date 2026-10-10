import { describe, expect, it } from 'vitest';

import { PROJECT_NAME_LENGTH, ProjectFormModel, projectValidations } from './project.validations';

const form = (over: Partial<ProjectFormModel> = {}): ProjectFormModel => ({
  name: 'Sommerfest', description: '', startDate: '20260601', endDate: '20260630', state: 'planned', ...over,
});

describe('projectValidations', () => {
  it('accepts a valid minimal project', () => {
    expect(projectValidations(form({ description: '', startDate: '', endDate: '' })).isValid()).toBe(true);
  });
  it('name: required', () => {
    expect(projectValidations(form({ name: '' })).getErrors('name')).toContain('required');
  });
  it('name: rejects more than PROJECT_NAME_LENGTH characters', () => {
    expect(projectValidations(form({ name: 'x'.repeat(PROJECT_NAME_LENGTH + 1) })).getErrors('name')).toContain('tooLong');
  });
  it('endDate: before startDate fails', () => {
    expect(projectValidations(form({ startDate: '20260630', endDate: '20260601' })).getErrors('endDate'))
      .toContain('@project/project/feature.validation.endBeforeStart');
  });
  it('endDate: same day passes', () => {
    expect(projectValidations(form({ startDate: '20260601', endDate: '20260601' })).getErrors('endDate')).toEqual([]);
  });
  it('endDate: without startDate passes', () => {
    expect(projectValidations(form({ startDate: '', endDate: '20260601' })).getErrors('endDate')).toEqual([]);
  });
});

describe('projectValidations — budgets (1.65 D25)', () => {
  it('budgets are optional and may be 0', () => {
    expect(projectValidations(form()).isValid()).toBe(true);
    expect(projectValidations(form({ budgetedRevenue: { amount: 0 }, budgetedExpenses: { amount: 120000 } })).isValid()).toBe(true);
  });
  it('a negative budget is rejected under its own field', () => {
    const r = projectValidations(form({ budgetedRevenue: { amount: -1 }, budgetedExpenses: { amount: -5 } }));
    expect(r.getErrors('budgetedRevenue')).toContain('@project/project/feature.validation.budgetNegative');
    expect(r.getErrors('budgetedExpenses')).toContain('@project/project/feature.validation.budgetNegative');
  });
});
