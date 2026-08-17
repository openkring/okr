import { describe, expect, it } from 'vitest';
import { schedulePollValidations } from './schedule-poll.validations';
import { SchedulePollFormData } from './schedule-poll.model';

function draft(overrides: Partial<SchedulePollFormData> = {}): SchedulePollFormData {
  return {
    name: 'SCS Achter',
    description: '',
    columns: [{ id: 'c0', startDate: '20260703', startTime: '' }],
    rows: [{ key: 'p1', firstName: 'Bruno', lastName: 'Kaiser', responses: { c0: 'accepted' } }],
    isDraft: true,
    ...overrides,
  };
}

describe('schedulePollValidations', () => {
  it('accepts a draft with a name and one column', () => {
    expect(schedulePollValidations(draft()).isValid()).toBe(true);
  });
  it('rejects a draft without a name', () => {
    expect(schedulePollValidations(draft({ name: '' })).isValid()).toBe(false);
  });
  it('rejects a draft without any column', () => {
    expect(schedulePollValidations(draft({ columns: [] })).isValid()).toBe(false);
  });
  it('accepts a live poll regardless of the name field', () => {
    expect(schedulePollValidations(draft({ name: '', isDraft: false })).isValid()).toBe(true);
  });
});
