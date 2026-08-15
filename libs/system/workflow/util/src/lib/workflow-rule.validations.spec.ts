import { describe, expect, it } from 'vitest';

import { newWorkflowRuleModel } from './workflow-rule.util';
import { workflowRuleValidations } from './workflow-rule.validations';

/**
 * The Signal Forms bridge calls the suite with the MODEL ONLY (no tenants/tags), and the form
 * shows no error note — an invalid field is invisible and only shows up as a change-confirmation
 * bar that never appears. These cases are the realistic rules that used to fail that way.
 */
const missing = undefined as unknown as string;   // what the bridge actually passes

function run(overrides: Partial<ReturnType<typeof newWorkflowRuleModel>>) {
  return workflowRuleValidations(Object.assign(newWorkflowRuleModel('scs'), overrides), missing, missing);
}

const VALID = {
  name: 'Kategoriewechsel → Materialwart',
  event: 'membership.categoryChanged',
  probe: 'categoryIs:passive,hasActiveOwnerships',
  responsibilityKey: 'quts1rewzl1ubx71tqu0',
  messageKey: '@system/workflow/messages.passiveResourceAdmin',
};

describe('workflowRuleValidations', () => {
  it('accepts a real rule (long name, ANDed probe, scoped message key)', () => {
    expect(run(VALID).isValid()).toBe(true);
  });

  it('requires name, event, responsibility and message key', () => {
    for (const field of ['name', 'event', 'responsibilityKey', 'messageKey'] as const) {
      expect(run({ ...VALID, [field]: '' }).hasErrors(field)).toBe(true);
    }
  });

  it('requires the probe argument only when the probe consumes one', () => {
    expect(run({ ...VALID, probe: 'categoryIs', probeArg: '' }).hasErrors('probeArg')).toBe(true);
    expect(run({ ...VALID, probe: 'categoryIs', probeArg: 'passive' }).isValid()).toBe(true);
    // inline argument, or a probe that takes none: no field, no requirement
    expect(run({ ...VALID, probe: 'categoryIs:passive', probeArg: '' }).isValid()).toBe(true);
    expect(run({ ...VALID, probe: 'hasActiveOwnerships', probeArg: '' }).isValid()).toBe(true);
  });

  it('rejects a due date beyond a year', () => {
    expect(run({ ...VALID, dueInDays: 400 }).hasErrors('dueInDays')).toBe(true);
  });
});
