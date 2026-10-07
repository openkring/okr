import { describe, expect, it } from 'vitest';

import { taskSettingsValidations, TaskSettings } from './task-settings.validations';

function model(overrides: Partial<TaskSettings> = {}): TaskSettings {
  return { taskArchiveDays: 30, ...overrides };
}

describe('taskSettingsValidations', () => {
  it('accepts the default (30 days)', () => {
    const result = taskSettingsValidations(model());
    expect(result.isValid()).toBe(true);
  });

  it('accepts 0 — never archive automatically', () => {
    const result = taskSettingsValidations(model({ taskArchiveDays: 0 }));
    expect(result.isValid()).toBe(true);
  });

  it('accepts the upper bound of 3650', () => {
    const result = taskSettingsValidations(model({ taskArchiveDays: 3650 }));
    expect(result.isValid()).toBe(true);
  });

  it('rejects a negative value', () => {
    const result = taskSettingsValidations(model({ taskArchiveDays: -1 }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('taskArchiveDays').length).toBeGreaterThan(0);
  });

  it('rejects a value beyond the upper bound', () => {
    const result = taskSettingsValidations(model({ taskArchiveDays: 3651 }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('taskArchiveDays').length).toBeGreaterThan(0);
  });

  it('rejects a fractional value', () => {
    const result = taskSettingsValidations(model({ taskArchiveDays: 1.5 }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('taskArchiveDays').length).toBeGreaterThan(0);
  });
});
