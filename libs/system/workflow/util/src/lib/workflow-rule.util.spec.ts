import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { WorkflowRuleModel } from '@okr/shared-models';
import { buildExportTable } from '@okr/shared-util-core';

import { WORKFLOW_I18N_KEYS, WorkflowI18n } from './workflow-i18n';
import { workflowRuleValidations } from './workflow-rule.validations';
import { addWorkflowStep, getWorkflowRuleCondition, getWorkflowRuleActions, getWorkflowRuleExportColumns, getWorkflowRuleIndex, getWorkflowStepSummary, getWorkflowSteps, isWorkflowRuleComplete, isWorkflowStepComplete, newWorkflowRuleModel, patchWorkflowStep, probeNeedsArg, removeWorkflowStep, setWorkflowStepAction } from './workflow-rule.util';

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

  it('covers every argument-taking probe in the engine registry', () => {
    // PROBES_WITH_ARG is a hand-maintained mirror of apps/functions/src/workflow/engine.ts
    // (a lib cannot import the functions app). When it drifts, the rule form silently HIDES
    // the probeArg field and the admin cannot enter the discriminator at all — the probe is
    // then unusable through the UI even though the engine supports it.
    expect(probeNeedsArg('paramIs')).toBe(true);
    expect(probeNeedsArg('decisionIs')).toBe(true);
  });

  it('accepts a paramIs argument long enough for a section or menu name', () => {
    // 'sourceName=' + a 30-char name = 41 chars. The old SHORT_NAME_LENGTH cap of 30 made the
    // main ui.buttonClicked / ui.menuCalled rule shape unenterable.
    const rule = newWorkflowRuleModel('scs', 'ui.buttonClicked');
    rule.probe = 'paramIs';
    rule.probeArg = 'sourceName=' + 'x'.repeat(30);
    expect(rule.probeArg.length).toBe(41);
    const result = workflowRuleValidations(rule, '', '');
    expect(result.getErrors('probeArg')).toEqual([]);
  });

  it('needs no argument field when paramIs carries its argument inline', () => {
    // 'paramIs:resourceType=boathouse' is the shape a category item uses, exactly like the
    // shipped 'categoryIs:passive,hasActiveOwnerships' item.
    expect(probeNeedsArg('paramIs:resourceType=boathouse')).toBe(false);
    expect(probeNeedsArg('paramIs:state=accepted,hasOpenInvoices')).toBe(false);
  });
});

describe('getWorkflowSteps', () => {
  it('gives a legacy document without steps one to edit', () => {
    expect(getWorkflowSteps(undefined)).toHaveLength(1);
    expect(getWorkflowSteps([])[0].action).toBe('openTask');
  });

  it('passes an existing list through unchanged', () => {
    const steps = newWorkflowRuleModel('scs').steps;
    expect(getWorkflowSteps(steps)).toBe(steps);
  });
});

describe('patchWorkflowStep', () => {
  it('patches the addressed step and leaves the others alone', () => {
    const steps = addWorkflowStep(newWorkflowRuleModel('scs').steps);
    const patched = patchWorkflowStep(steps, 1, { messageKey: '@a.b' });

    expect(patched[1].messageKey).toBe('@a.b');
    expect(patched[0].messageKey).toBe('');
    expect(patched).not.toBe(steps);
    expect(steps[1].messageKey).toBe('');
  });

  it('ignores an index outside the list', () => {
    const steps = newWorkflowRuleModel('scs').steps;
    expect(patchWorkflowStep(steps, 7, { messageKey: '@a.b' })[0].messageKey).toBe('');
  });
});

describe('setWorkflowStepAction', () => {
  it('drops the argument when the new action does not consume one', () => {
    let steps = setWorkflowStepAction(undefined, 0, 'sendEmail');
    steps = patchWorkflowStep(steps, 0, { actionArg: 'welcome' });
    expect(setWorkflowStepAction(steps, 0, 'openTask')[0].actionArg).toBe('');
  });

  it('keeps the argument when the new action still consumes one', () => {
    let steps = patchWorkflowStep(undefined, 0, { actionArg: 'welcome' });
    steps = setWorkflowStepAction(steps, 0, 'sendEmail');
    expect(steps[0].actionArg).toBe('welcome');
  });

  it('drops the write-back on anything but an approval', () => {
    let steps = setWorkflowStepAction(undefined, 0, 'requestApproval');
    steps = patchWorkflowStep(steps, 0, { writeBack: 'persons.isSkiffPlatzApproved' });
    expect(setWorkflowStepAction(steps, 0, 'openTask')[0].writeBack).toBe('');
  });
});

describe('addWorkflowStep / removeWorkflowStep', () => {
  it('appends a fresh openTask step', () => {
    const steps = addWorkflowStep(newWorkflowRuleModel('scs').steps);
    expect(steps).toHaveLength(2);
    expect(steps[1].action).toBe('openTask');
  });

  it('removes the addressed step', () => {
    const steps = patchWorkflowStep(addWorkflowStep(undefined), 1, { messageKey: '@second' });
    expect(removeWorkflowStep(steps, 0)).toHaveLength(1);
    expect(removeWorkflowStep(steps, 0)[0].messageKey).toBe('@second');
  });

  it('never removes the last step — a rule without a consequence does nothing', () => {
    const steps = newWorkflowRuleModel('scs').steps;
    expect(removeWorkflowStep(steps, 0)).toHaveLength(1);
  });
});

describe('isWorkflowStepComplete', () => {
  it('needs a message key', () => {
    const [step] = getWorkflowSteps(undefined);
    expect(isWorkflowStepComplete(step)).toBe(false);
    expect(isWorkflowStepComplete({ ...step, messageKey: '@a.b' })).toBe(true);
  });

  it('needs the argument of an action that consumes one', () => {
    const step = { action: 'sendEmail', actionArg: '', messageKey: '@a.b', dueInDays: 0, writeBack: '' };
    expect(isWorkflowStepComplete(step)).toBe(false);
    expect(isWorkflowStepComplete({ ...step, actionArg: 'welcome' })).toBe(true);
  });
});

describe('getWorkflowStepSummary', () => {
  it('joins the fields that distinguish two steps of the same action', () => {
    expect(getWorkflowStepSummary({ action: 'sendEmail', actionArg: 'welcome', messageKey: '@a.b', dueInDays: 0, writeBack: '' }))
      .toBe('welcome · @a.b');
    expect(getWorkflowStepSummary({ action: 'openTask', actionArg: '', messageKey: '@a.b', dueInDays: 0, writeBack: '' }))
      .toBe('@a.b');
  });
});

describe('getWorkflowRuleActions / isWorkflowRuleComplete', () => {
  it('lists the actions in execution order', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.steps = setWorkflowStepAction(addWorkflowStep(rule.steps), 1, 'sendEmail');
    expect(getWorkflowRuleActions(rule)).toEqual(['openTask', 'sendEmail']);
  });

  it('reports a rule with a half-configured step as incomplete', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.steps = patchWorkflowStep(rule.steps, 0, { messageKey: '@a.b' });
    expect(isWorkflowRuleComplete(rule)).toBe(true);

    rule.steps = setWorkflowStepAction(addWorkflowStep(rule.steps), 1, 'sendEmail');
    expect(isWorkflowRuleComplete(rule)).toBe(false);
  });
});

describe('getWorkflowRuleCondition', () => {
  it('leaves out the event — the grouped list already shows it', () => {
    const rule = newWorkflowRuleModel('scs', 'membership.ended');
    rule.probe = 'hasOwnershipOfType';
    rule.probeArg = 'key';
    rule.responsibilityKey = 'scs-keys';

    expect(getWorkflowRuleCondition(rule, () => 'Schlüsselverwaltung'))
      .toBe('hasOwnershipOfType:key → Schlüsselverwaltung');
  });

  it('is empty for an unconditional rule without a responsibility', () => {
    expect(getWorkflowRuleCondition(newWorkflowRuleModel('scs', 'membership.ended'))).toBe('');
  });
});
