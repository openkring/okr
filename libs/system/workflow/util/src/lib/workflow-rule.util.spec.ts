import { describe, expect, it } from 'vitest';

import { WorkflowRuleModel } from '@okr/shared-models';

import { getWorkflowRuleIndex, getWorkflowRuleSummary, newWorkflowRuleModel } from './workflow-rule.util';

describe('newWorkflowRuleModel', () => {
  it('creates a rule for the given tenant and event', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    expect(rule).toBeInstanceOf(WorkflowRuleModel);
    expect(rule.tenants).toEqual(['scs']);
    expect(rule.event).toBe('membership.ended');
  });

  it('defaults to the only v1 action and to "always fires"', () => {
    const rule = newWorkflowRuleModel('scs');
    expect(rule.action).toBe('openTask');
    expect(rule.probe).toBe('');
  });
});

describe('getWorkflowRuleIndex', () => {
  it('indexes name, event and responsibility', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.name = 'Austritt';
    rule.responsibilityKey = 'treasurer';
    const index = getWorkflowRuleIndex(rule);
    expect(index).toContain('n:Austritt');
    expect(index).toContain('e:membership.ended');
    expect(index).toContain('r:treasurer');
  });
});

describe('getWorkflowRuleSummary', () => {
  it('joins event, probe with its argument, and the responsibility', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.probe = 'hasOwnershipOfType';
    rule.probeArg = 'key';
    rule.responsibilityKey = 'resourceAdmin';
    expect(getWorkflowRuleSummary(rule)).toBe('membership.ended · hasOwnershipOfType:key · → resourceAdmin');
  });

  it('omits the probe when the rule always fires', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.created');
    rule.responsibilityKey = 'treasurer';
    expect(getWorkflowRuleSummary(rule)).toBe('membership.created · → treasurer');
  });

  it('omits the argument when the probe takes none', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.probe = 'hasOpenInvoices';
    expect(getWorkflowRuleSummary(rule)).toBe('membership.ended · hasOpenInvoices');
  });
});
