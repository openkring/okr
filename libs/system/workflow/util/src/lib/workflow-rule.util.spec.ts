import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { WorkflowRuleModel } from '@okr/shared-models';
import { buildExportTable } from '@okr/shared-util-core';

import { WORKFLOW_I18N_KEYS, WorkflowI18n } from './workflow-i18n';
import { getWorkflowRuleExportColumns, getWorkflowRuleIndex, getWorkflowRuleSummary, newWorkflowRuleModel, probeNeedsArg } from './workflow-rule.util';

describe('newWorkflowRuleModel', () => {
  it('creates a rule for the given tenant and event', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    expect(rule).toBeInstanceOf(WorkflowRuleModel);
    expect(rule.tenants).toEqual(['scs']);
    expect(rule.event).toBe('membership.ended');
  });

  it('defaults to the only v1 action and to "always fires"', () => {
    const rule = newWorkflowRuleModel('scs');
    expect(rule.steps[0].action).toBe('openTask');
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

  it('shows the responsibility name, falling back to the key when unknown', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.responsibilityKey = 'scs-treasurer';
    const names = new Map([['scs-treasurer', 'Kassier']]);
    const resolve = (key: string) => names.get(key) ?? key;
    expect(getWorkflowRuleSummary(rule, resolve)).toBe('membership.ended · → Kassier');

    rule.responsibilityKey = 'deleted';
    expect(getWorkflowRuleSummary(rule, resolve)).toBe('membership.ended · → deleted');
  });
});

describe('getWorkflowRuleExportColumns', () => {
  /** Every label resolves to its own key name, so a header assertion reads like the key. */
  const i18n = Object.fromEntries(
    Object.keys(WORKFLOW_I18N_KEYS).map((key) => [key, signal(key)])
  ) as unknown as WorkflowI18n;

  it('exports one row per rule, with the responsibility resolved to its name', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.name = 'Austritt → Kassier';
    rule.responsibilityKey = 'scs-treasurer';
    rule.steps[0].dueInDays = 30;

    const columns = getWorkflowRuleExportColumns(i18n, () => 'Kassier');
    const [header, row] = buildExportTable([rule], columns);

    expect(header[0]).toBe('name_label');
    expect(row[0]).toBe('Austritt → Kassier');
    expect(row[1]).toBe('membership.ended');
    expect(row[4]).toBe('Kassier');
    expect(row[6]).toBe('30');
  });
});

describe('probeNeedsArg', () => {
  it('is true only for a bare argument-taking probe', () => {
    expect(probeNeedsArg('categoryIs')).toBe(true);
    expect(probeNeedsArg('hasOwnershipOfType')).toBe(true);
    expect(probeNeedsArg('hasActiveOwnerships')).toBe(false);
    expect(probeNeedsArg('hasOpenInvoices')).toBe(false);
    expect(probeNeedsArg('always')).toBe(false);
    expect(probeNeedsArg('')).toBe(false);
    expect(probeNeedsArg(undefined)).toBe(false);
  });

  it('ignores a probe that carries its own inline argument', () => {
    expect(probeNeedsArg('categoryIs:passive')).toBe(false);
    expect(probeNeedsArg('categoryIs:passive,hasActiveOwnerships')).toBe(false);
  });

  it('is true when any item of an AND-list still needs the argument', () => {
    expect(probeNeedsArg('hasActiveOwnerships, categoryIs')).toBe(true);
  });
});
